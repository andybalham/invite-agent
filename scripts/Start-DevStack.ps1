[CmdletBinding()]
param(
    [int]$ReadinessTimeoutSeconds = 90,
    [int]$DynamoDbPort,
    [int]$ApiPort,
    [int]$WebPort,
    [string]$SmokeRunManifestPath,
    [switch]$SkipBuild
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$stateDirectory = Join-Path $repoRoot '.devstack'
$logsDirectory = Join-Path $stateDirectory 'service-logs'
$statePath = Join-Path $stateDirectory 'processes.json'
$localEncryptionConfigPath = Join-Path $stateDirectory 'local-encryption.json'
$composeProject = 'invite-a-gent-local'

function Initialize-LocalEncryptionConfig {
    # Smoke runs and callers with explicit secret configuration own their key ring.
    $activeKeyId = $env:PUBLIC_TOKEN_ENCRYPTION_ACTIVE_KEY_ID
    $encodedKeys = $env:PUBLIC_TOKEN_ENCRYPTION_KEYS
    if ($activeKeyId -or $encodedKeys) {
        if (-not $activeKeyId -or -not $encodedKeys) {
            throw 'PUBLIC_TOKEN_ENCRYPTION_ACTIVE_KEY_ID and PUBLIC_TOKEN_ENCRYPTION_KEYS must be supplied together.'
        }
        return
    }

    if (Test-Path -LiteralPath $localEncryptionConfigPath) {
        try {
            $saved = Get-Content -Raw -LiteralPath $localEncryptionConfigPath | ConvertFrom-Json
            if (-not $saved.activeKeyId -or -not $saved.keys) { throw 'missing key-ring fields' }
            $env:PUBLIC_TOKEN_ENCRYPTION_ACTIVE_KEY_ID = [string]$saved.activeKeyId
            $env:PUBLIC_TOKEN_ENCRYPTION_KEYS = $saved.keys | ConvertTo-Json -Compress
            return
        } catch {
            throw "Invalid local encryption configuration at $localEncryptionConfigPath; remove or repair it before restarting."
        }
    }

    $bytes = [System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32)
    $encodedKey = [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')
    $keyRing = [ordered]@{ activeKeyId = 'local'; keys = [ordered]@{ local = $encodedKey } }
    New-Item -ItemType Directory -Path $stateDirectory -Force | Out-Null
    $keyRing | ConvertTo-Json -Compress | Set-Content -LiteralPath $localEncryptionConfigPath -Encoding utf8
    $env:PUBLIC_TOKEN_ENCRYPTION_ACTIVE_KEY_ID = $keyRing.activeKeyId
    $env:PUBLIC_TOKEN_ENCRYPTION_KEYS = $keyRing.keys | ConvertTo-Json -Compress
}

function Resolve-Port {
    param([string]$EnvironmentName, [int]$ParameterValue, [int]$DefaultValue)
    $value = $ParameterValue
    if ($value -eq 0) {
        $environmentValue = [Environment]::GetEnvironmentVariable($EnvironmentName)
        $value = if ($environmentValue) { [int]$environmentValue } else { $DefaultValue }
    }
    if ($value -lt 1 -or $value -gt 65535) {
        throw "$EnvironmentName must be a valid TCP port between 1 and 65535"
    }
    return $value
}

$DynamoDbPort = Resolve-Port -EnvironmentName 'DYNAMODB_PORT' -ParameterValue $DynamoDbPort -DefaultValue 18000
$ApiPort = Resolve-Port -EnvironmentName 'API_PORT' -ParameterValue $ApiPort -DefaultValue 14000
$WebPort = Resolve-Port -EnvironmentName 'WEB_PORT' -ParameterValue $WebPort -DefaultValue 15173

if ($env:E2E_MODE -and -not $SmokeRunManifestPath) {
    throw 'Managed E2E uses its coordinator; Start-DevStack requires the smoke manifest for E2E.'
}
if ($SmokeRunManifestPath) {
    $smokeIdentity = Get-Content -Raw -LiteralPath $SmokeRunManifestPath | ConvertFrom-Json
    $configurationJson = & node (Join-Path $PSScriptRoot 'resolve-smoke-configuration.mjs') $SmokeRunManifestPath $smokeIdentity.runId $DynamoDbPort $ApiPort $WebPort
    if ($LASTEXITCODE -ne 0) { throw 'Unsafe smoke configuration; startup refused.' }
    $configuration = $configurationJson | ConvertFrom-Json
    if ($smokeIdentity.endpoint -ne $configuration.endpoint -or $smokeIdentity.region -ne $configuration.region) { throw 'Smoke manifest endpoint/region does not match the effective stack configuration.' }
    foreach ($port in @($ApiPort, $WebPort)) {
        $probe = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $port)
        try { $probe.Start() } catch { throw "E2E service port $port is occupied; refusing caller service reuse." } finally { $probe.Stop() }
    }
    $env:E2E_MODE = 'smoke'
    $env:E2E_ALLOW_SHARED_TABLES = '0'
    $env:APP_ENV = $configuration.appEnv
    $env:AUTH_MODE = $configuration.authMode
    $env:AWS_REGION = $configuration.region
    if ($null -eq $env:PUBLIC_TOKEN_HASH_KEY) { $env:PUBLIC_TOKEN_HASH_KEY = 'local-development-token-hash-key' }
}

function Wait-ForTcpPort {
    param([string]$HostName, [int]$Port, [datetime]$Deadline)
    while ((Get-Date) -lt $Deadline) {
        $client = [System.Net.Sockets.TcpClient]::new()
        try {
            $connect = $client.ConnectAsync($HostName, $Port)
            if ($connect.Wait(500) -and $client.Connected) { return }
        } catch { } finally { $client.Dispose() }
        Start-Sleep -Milliseconds 250
    }
    throw "Timed out waiting for ${HostName}:${Port}"
}

function Wait-ForDynamoDb {
    param([int]$Port, [datetime]$Deadline)
    while ((Get-Date) -lt $Deadline) {
        if (Test-DynamoDb -Port $Port) { return }
        Start-Sleep -Milliseconds 300
    }
    throw 'Timed out waiting for DynamoDB readiness'
}

function Test-DynamoDb {
    param([int]$Port)
    try {
        $headers = @{ 'X-Amz-Target' = 'DynamoDB_20120810.ListTables' }
        $response = Invoke-WebRequest -Uri "http://127.0.0.1:$Port" -Method Post -Headers $headers -ContentType 'application/x-amz-json-1.0' -Body '{}' -UseBasicParsing -TimeoutSec 2
        return $response.StatusCode -eq 200
    } catch {
        $statusCode = $_.Exception.Response.StatusCode
        $isDynamoDbAuthenticationChallenge =
            [int]$statusCode -eq 400 -and
            $_.ErrorDetails.Message -match 'MissingAuthenticationToken'
        return $isDynamoDbAuthenticationChallenge
    }
}

function Wait-ForHttp {
    param([string]$Uri, [datetime]$Deadline)
    while ((Get-Date) -lt $Deadline) {
        try {
            $response = Invoke-WebRequest -Uri $Uri -UseBasicParsing
            if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 400) { return }
        } catch { }
        Start-Sleep -Milliseconds 300
    }
    throw "Timed out waiting for $Uri"
}

function Save-State {
    param([array]$Processes, [bool]$DynamoDbStarted)
    $state = @{
        composeProject = $composeProject
        dynamodbStarted = $DynamoDbStarted
        ports = @{ dynamodb = $DynamoDbPort; api = $ApiPort; web = $WebPort }
        processes = $Processes
        smokeRunManifestPath = $SmokeRunManifestPath
    }
    $state | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $statePath -Encoding utf8
}

if (Test-Path -LiteralPath $statePath) {
    throw "A recorded dev stack already exists. Run 'npm run dev:stop' first."
}

New-Item -ItemType Directory -Path $logsDirectory -Force | Out-Null
Initialize-LocalEncryptionConfig
$deadline = (Get-Date).AddSeconds($ReadinessTimeoutSeconds)
$recorded = @()
$dynamoDbStarted = $false

try {
    Push-Location $repoRoot
    try {
        if (-not (Test-DynamoDb -Port $DynamoDbPort)) {
            $dynamoDbStarted = $true
            Save-State -Processes $recorded -DynamoDbStarted $dynamoDbStarted
            $env:DYNAMODB_PORT = $DynamoDbPort.ToString()
            & docker compose -p $composeProject up -d dynamodb
            if ($LASTEXITCODE -ne 0) { throw 'Docker Compose failed to start DynamoDB' }
        } else {
            Save-State -Processes $recorded -DynamoDbStarted $dynamoDbStarted
        }
        Wait-ForTcpPort -HostName '127.0.0.1' -Port $DynamoDbPort -Deadline $deadline
        Wait-ForDynamoDb -Port $DynamoDbPort -Deadline $deadline

        if (-not $SkipBuild) {
            & node (Join-Path $repoRoot 'node_modules/typescript/bin/tsc') -b --pretty false
            if ($LASTEXITCODE -ne 0) { throw 'TypeScript build failed' }
        }

        $env:DYNAMODB_PORT = $DynamoDbPort.ToString()
        $env:DYNAMODB_ENDPOINT = "http://127.0.0.1:$DynamoDbPort"
        $env:API_PORT = $ApiPort.ToString()
        $env:WEB_PORT = $WebPort.ToString()
        $env:PUBLIC_BASE_URL = "http://127.0.0.1:$WebPort"
        if ($SmokeRunManifestPath) {
            $manifest = Get-Content -Raw -LiteralPath $SmokeRunManifestPath | ConvertFrom-Json
            if ($manifest.endpoint -ne $env:DYNAMODB_ENDPOINT) { throw 'Smoke manifest endpoint does not match the local stack.' }
            & node (Join-Path $PSScriptRoot 'smoke-run-resources.mjs') provision $SmokeRunManifestPath
            if ($LASTEXITCODE -ne 0) { throw 'Smoke table provisioning failed.' }
            $env:APP_TABLE_NAME = $manifest.tables[0].name
            $env:AUDIT_TABLE_NAME = $manifest.tables[1].name
            $env:SMOKE_RUN_MANIFEST_PATH = $SmokeRunManifestPath
        }
        $api = Start-Process -FilePath 'node' -ArgumentList @('backend/dist/adapters/local/dev-server.js') -WorkingDirectory $repoRoot -RedirectStandardOutput (Join-Path $logsDirectory 'api.out.log') -RedirectStandardError (Join-Path $logsDirectory 'api.error.log') -PassThru -WindowStyle Hidden
        $recorded += @{ name = 'api'; pid = $api.Id; startTimeUtcFileTime = $api.StartTime.ToFileTimeUtc().ToString() }
        Save-State -Processes $recorded -DynamoDbStarted $dynamoDbStarted
        Wait-ForHttp -Uri "http://127.0.0.1:$ApiPort/health" -Deadline $deadline

        $vite = Start-Process -FilePath 'node' -ArgumentList @('node_modules/vite/bin/vite.js', 'frontend', '--host', '127.0.0.1', '--port', $WebPort, '--strictPort') -WorkingDirectory $repoRoot -RedirectStandardOutput (Join-Path $logsDirectory 'vite.out.log') -RedirectStandardError (Join-Path $logsDirectory 'vite.error.log') -PassThru -WindowStyle Hidden
        $recorded += @{ name = 'vite'; pid = $vite.Id; startTimeUtcFileTime = $vite.StartTime.ToFileTimeUtc().ToString() }
        Save-State -Processes $recorded -DynamoDbStarted $dynamoDbStarted
        Wait-ForHttp -Uri "http://127.0.0.1:$WebPort" -Deadline $deadline
    } finally {
        Pop-Location
    }
    Write-Output "Invite-a-Gent is ready at http://127.0.0.1:$WebPort (API $ApiPort, DynamoDB $DynamoDbPort)"
} catch {
    $startupFailure = $_
    try { & (Join-Path $PSScriptRoot 'Stop-DevStack.ps1') }
    catch { Write-Warning "Startup cleanup failed: $($_.Exception.Message)" }
    throw $startupFailure
}
