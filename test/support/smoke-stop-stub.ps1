$repoRoot = Split-Path -Parent $PSScriptRoot
$statePath = Join-Path $repoRoot '.devstack/processes.json'
$state = Get-Content -Raw -LiteralPath $statePath | ConvertFrom-Json
$manifest = Get-Content -Raw -LiteralPath $state.smokeRunManifestPath | ConvertFrom-Json
if ($env:WRAPPER_FAULT -eq 'cleanup') { throw 'injected teardown failure; manifest retained' }
foreach ($table in $manifest.tables) { $table.cleanup = 'deleted' }
$manifest | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $state.smokeRunManifestPath
Remove-Item -LiteralPath $statePath
Write-Output 'stub scoped shutdown diagnostics'
