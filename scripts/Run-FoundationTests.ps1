[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot

Push-Location $repoRoot
try {
    & node --test test/foundation/*.test.mjs
    if ($LASTEXITCODE -ne 0) { throw 'Foundation contract tests failed' }

    # Playwright global setup provisions and owns an isolated per-run stack.
    & node node_modules/@playwright/test/cli.js test --project=chromium --workers=1 --retries=0
    if ($LASTEXITCODE -ne 0) { throw 'Playwright foundation tests failed' }
} finally {
    Pop-Location
}
