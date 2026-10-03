[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$statePath = Join-Path $repoRoot '.devstack/processes.json'

if (-not (Test-Path -LiteralPath $statePath)) {
    Write-Output 'No recorded Invite-a-Gent dev stack is running.'
    exit 0
}

$state = Get-Content -Raw -LiteralPath $statePath | ConvertFrom-Json
$processes = @($state.processes)
[array]::Reverse($processes)

foreach ($record in $processes) {
    $process = Get-Process -Id $record.pid -ErrorAction SilentlyContinue
    if ($null -eq $process) { continue }
    $actualStart = $process.StartTime.ToFileTimeUtc().ToString()
    if ($actualStart -ne $record.startTimeUtcFileTime) {
        Write-Warning "Skipped reused process id $($record.pid); start time did not match the recorded project process."
        continue
    }
    Stop-Process -Id $record.pid -Force
}

try {
    # API and web processes are stopped; keep DynamoDB reachable for owned-table teardown.
    if ($state.smokeRunManifestPath) {
        & node (Join-Path $PSScriptRoot 'smoke-run-resources.mjs') cleanup $state.smokeRunManifestPath
        if ($LASTEXITCODE -ne 0) { throw 'Smoke table cleanup failed; see the run manifest.' }
    }
} finally {
    if ($state.dynamodbStarted -and $state.composeProject -eq 'invite-a-gent-local') {
        Push-Location $repoRoot
        try {
            & docker compose -p $state.composeProject down
            if ($LASTEXITCODE -ne 0) { throw 'Docker Compose shutdown failed; recorded state retained.' }
        } finally {
            Pop-Location
        }
    }
    Remove-Item -LiteralPath $statePath -Force
}
Write-Output 'Stopped recorded Invite-a-Gent dev-stack processes.'
