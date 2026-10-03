param([string]$SmokeRunManifestPath, [int]$ReadinessTimeoutSeconds, [int]$DynamoDbPort, [int]$ApiPort, [int]$WebPort)

$repoRoot = Split-Path -Parent $PSScriptRoot
$manifest = Get-Content -Raw -LiteralPath $SmokeRunManifestPath | ConvertFrom-Json
foreach ($table in $manifest.tables) { $table.creationAttempted = $true }
$manifest | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $SmokeRunManifestPath
$state = @{ smokeRunManifestPath = $SmokeRunManifestPath; dynamodbStarted = $false; ports = @{ dynamodb = 18000; api = 14000; web = 15173 } }
if ($env:WRAPPER_FAULT -eq 'foreign') { $state.smokeRunManifestPath = 'someone-elses-manifest' }
$state | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $repoRoot '.devstack/processes.json')
$logs = Join-Path $repoRoot '.devstack/service-logs'
New-Item -ItemType Directory -Path $logs -Force | Out-Null
'service evidence' | Set-Content -LiteralPath (Join-Path $logs 'api.out.log')
if ($env:WRAPPER_FAULT -eq 'diagnostic') {
    'copy collision' | Set-Content -LiteralPath (Join-Path (Split-Path -Parent $SmokeRunManifestPath) 'service-logs')
}
Write-Output 'stub startup diagnostics'
if ($env:WRAPPER_FAULT -eq 'startup') { throw 'injected startup failure after provisioning' }
