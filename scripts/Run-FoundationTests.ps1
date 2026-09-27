[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$start = Join-Path $PSScriptRoot 'Start-DevStack.ps1'
$stop = Join-Path $PSScriptRoot 'Stop-DevStack.ps1'

Push-Location $repoRoot
try {
    & node --test test/foundation/*.test.mjs
    if ($LASTEXITCODE -ne 0) { throw 'Foundation contract tests failed' }

    & $start
    & node node_modules/@playwright/test/cli.js test
    if ($LASTEXITCODE -ne 0) { throw 'Playwright foundation tests failed' }
} finally {
    & $stop
    Pop-Location
}
