[CmdletBinding()]
param(
    [int]$ReadinessTimeoutSeconds = 90,
    [int]$DynamoDbPort,
    [int]$ApiPort,
    [int]$WebPort
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$statePath = Join-Path $repoRoot '.devstack/processes.json'

# Refuse before entering cleanup: this invocation must never stop an existing stack.
if (Test-Path -LiteralPath $statePath) {
    Write-Error "A recorded dev stack already exists. Run 'npm run dev:stop' first, or run the targeted Playwright spec against it."
    exit 1
}

$runId = "$(Get-Date -AsUTC -Format 'yyyyMMddTHHmmssfffZ')-$([guid]::NewGuid().ToString('N'))".ToLowerInvariant()
$runDirectory = Join-Path $repoRoot ".devstack/smoke-runs/$runId"
New-Item -ItemType Directory -Path $runDirectory -Force | Out-Null
$startedAt = [datetime]::UtcNow
$exitCode = 1
$testExitCode = $null
$stage = 'startup'
$ports = $null
$failure = $null
$cleanupFailure = $null
$diagnosticFailures = @()
$manifestPath = Join-Path $runDirectory 'manifest.json'

Push-Location $repoRoot
try {
    Write-Output "Smoke evidence: $runDirectory"
    $effectiveDynamoDbPort = if ($DynamoDbPort) { $DynamoDbPort } elseif ($env:DYNAMODB_PORT) { [int]$env:DYNAMODB_PORT } else { 18000 }
    & node (Join-Path $PSScriptRoot 'smoke-run-resources.mjs') init $manifestPath $runId "http://127.0.0.1:$effectiveDynamoDbPort"
    if ($LASTEXITCODE -ne 0) { throw 'Smoke manifest initialization failed.' }
    # Startup sets the effective port/endpoint environment for both services and Playwright.
    & (Join-Path $PSScriptRoot 'Start-DevStack.ps1') -SmokeRunManifestPath $manifestPath -ReadinessTimeoutSeconds $ReadinessTimeoutSeconds -DynamoDbPort $DynamoDbPort -ApiPort $ApiPort -WebPort $WebPort *>&1 |
        Tee-Object -FilePath (Join-Path $runDirectory 'startup.log')
    $ports = (Get-Content -Raw -LiteralPath $statePath | ConvertFrom-Json).ports

    $stage = 'smoke'
    & node node_modules/@playwright/test/cli.js test test/e2e/smoke.spec.ts --project=chromium --workers=1 --retries=0 2>&1 |
        Tee-Object -FilePath (Join-Path $runDirectory 'playwright.log')
    $testExitCode = $LASTEXITCODE
    $exitCode = $testExitCode
    if ($testExitCode -ne 0) { $failure = "Playwright smoke journey failed (exit $testExitCode)." }
} catch {
    $failure = $_.Exception.Message
    Write-Error -Message $failure -ErrorAction Continue
} finally {
    # Preserve diagnostics before shutdown, including startup failures with no browser report.
    foreach ($name in @('service-logs', 'test-results', 'playwright-report')) {
        if ($name -ne 'service-logs' -and $null -eq $testExitCode) { continue }
        $source = Join-Path $repoRoot $(if ($name -eq 'service-logs') { '.devstack/service-logs' } else { $name })
        try {
            if (Test-Path -LiteralPath $source) {
                Copy-Item -LiteralPath $source -Destination (Join-Path $runDirectory $name) -Recurse
            }
        } catch {
            $diagnosticFailures += "${name}: $($_.Exception.Message)"
            Write-Warning "Could not preserve ${name}: $($_.Exception.Message)"
        }
    }
    try {
        if (Test-Path -LiteralPath $statePath) {
            $recordedState = Get-Content -Raw -LiteralPath $statePath | ConvertFrom-Json
            if ($recordedState.smokeRunManifestPath -ne $manifestPath) {
                throw 'Refusing to stop a stack that is not owned by this smoke run; recorded state retained.'
            }
            & (Join-Path $PSScriptRoot 'Stop-DevStack.ps1') *>&1 |
                Tee-Object -FilePath (Join-Path $runDirectory 'shutdown.log')
            if (Test-Path -LiteralPath $statePath) { throw 'Recorded stack state remains after shutdown.' }
        }
        # Startup may already have stopped its stack, or may fail before recording it.
        if (Test-Path -LiteralPath $manifestPath) {
            $manifest = Get-Content -Raw -LiteralPath $manifestPath | ConvertFrom-Json
            $unfinished = @($manifest.tables | Where-Object { $_.creationAttempted -and $_.cleanup -notin @('deleted', 'absent') })
            if ($unfinished.Count -gt 0) {
                & node (Join-Path $PSScriptRoot 'smoke-run-resources.mjs') cleanup $manifestPath *>&1 |
                    Tee-Object -FilePath (Join-Path $runDirectory 'table-cleanup.log')
                if ($LASTEXITCODE -ne 0) { throw 'Smoke table cleanup failed; see manifest.json.' }
            }
        }
    } catch {
        $cleanupFailure = $_.Exception.Message
        Write-Error -Message "Smoke stack cleanup failed: $cleanupFailure" -ErrorAction Continue
        if ($exitCode -eq 0) { $exitCode = 1 }
    }
    Pop-Location
    $summary = [ordered]@{
        runId = $runId
        manifestPath = $manifestPath
        stage = $stage
        startedAt = $startedAt.ToString('o')
        finishedAt = [datetime]::UtcNow.ToString('o')
        elapsedSeconds = [math]::Round(([datetime]::UtcNow - $startedAt).TotalSeconds, 1)
        ports = $ports
        testExitCode = $testExitCode
        exitCode = $exitCode
        failure = $failure
        cleanupFailure = $cleanupFailure
        diagnosticFailures = $diagnosticFailures
        recordedStackStopped = -not (Test-Path -LiteralPath $statePath)
    }
    $summary | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $runDirectory 'summary.json') -Encoding utf8
}

Write-Output "Smoke finished with exit $exitCode; evidence: $runDirectory"
exit $exitCode
