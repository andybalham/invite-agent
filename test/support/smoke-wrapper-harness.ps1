param([string]$Wrapper)

$ErrorActionPreference = 'Stop'
# Run the production wrapper in a disposable checkout with deterministic startup/browser faults.
function node {
    if ($args[0] -like '*resolve-smoke-configuration*') {
        @{ endpoint = 'http://127.0.0.1:18000'; dynamodbPort = 18000; apiPort = 14000; webPort = 15173; publicBaseUrl = 'http://127.0.0.1:15173'; region = 'eu-west-2'; appEnv = 'test'; authMode = 'local'; appTableName = "invite-agent-smoke-app-$($args[2])"; auditTableName = "invite-agent-smoke-audit-$($args[2])" } | ConvertTo-Json -Compress
        $global:LASTEXITCODE = 0
    } elseif ($args[1] -eq 'init') {
        $manifest = @{
            runId = $args[3]
            endpoint = $args[4]
            pollIds = @()
            tables = @(
                @{ name = "invite-agent-smoke-app-$($args[3])"; creationAttempted = $false; cleanup = 'pending' },
                @{ name = "invite-agent-smoke-audit-$($args[3])"; creationAttempted = $false; cleanup = 'pending' }
            )
        }
        $manifest | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $args[2]
        $global:LASTEXITCODE = 0
    } elseif ($args[0] -like '*playwright*') {
        Write-Output 'stub browser diagnostics'
        $global:LASTEXITCODE = if ($env:WRAPPER_FAULT -in @('browser', 'cleanup')) { 7 } else { 0 }
    } else {
        throw "Unexpected node invocation: $args"
    }
}

& $Wrapper
exit $LASTEXITCODE
