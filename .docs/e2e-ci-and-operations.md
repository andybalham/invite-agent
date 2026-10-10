# Isolated E2E CI and operations

The browser suites run against disposable, per-invocation DynamoDB tables. They must never use the development tables `invite-agent-local-app` or `invite-agent-local-audit`. A passing browser assertion is not a clean run unless the coordinator also confirms that its owned tables are absent.

## Prerequisites

Use Node.js 24, npm 11.6.0, PowerShell 7+, Docker Engine with Compose, and installed Playwright Chromium. No AWS account or credentials are required. DynamoDB Local must be reachable at an explicit loopback HTTP endpoint; the managed browser coordinator starts the API and Vite processes, but not DynamoDB Local.

For a local run:

```sh
npm ci
npx playwright install chromium
docker compose -p invite-a-gent-local up -d dynamodb
```

Keep `API_PORT` and `WEB_PORT` free. Set `DYNAMODB_PORT`, `API_PORT`, or `WEB_PORT` together when using non-default ports.

## Suite commands and ownership

| Suite | Command | Scope | Whole-command expectation |
| --- | --- | --- | --- |
| Fast regression | `npm run test:e2e:fast` | Ordinary browser regression; excludes smoke, diagnostics, cleanup probes, and `@exhaustive` cases | 6-minute ceiling |
| Foundation + fast browser gate | `npm run test:foundation` | Foundation Node tests followed by the fast isolated browser suite | 6-minute browser/runner budget, plus foundation tests |
| Focused discovery | `npm run test:discovery` | Rules, components, API/repository tests, and bounded dashboard browser coverage | 10-minute ceiling |
| Smoke | `npm run test:e2e:smoke` | The managed SM-01–SM-11 journey | 6-minute ceiling |
| Exhaustive | `npm run test:e2e:exhaustive` | `@exhaustive` pagination/integrity browser cases | 15-minute ceiling |

Every browser command uses Chromium, one worker, and zero retries. The fast, discovery, and exhaustive commands use the E2E coordinator and create `invite-agent-e2e-app-<runId>` / `invite-agent-e2e-audit-<runId>` with matching ownership markers. Smoke uses its separate v1 `invite-agent-smoke-*` pair and manifest. Workers and test attempts share only their current invocation's pair; a rerun receives a new pair. No suite may fall back to inherited table names.

The browser coordinator requires DynamoDB Local, provisions its pair, starts its own API/web processes, and tears both processes and tables down. Integration fixtures in discovery similarly own disposable integration tables. Do not run these commands against a caller-owned stack unless deliberately using the documented shared-debugging opt-in; shared mode is rejected in CI.

## Cleanup and recovery

On success, failure, timeout, or catchable interruption, cleanup stops verified run-owned writers before deleting only tables whose live ownership marker and creation identity still match the manifest. Cleanup errors are independent failures: a green test with failed cleanup exits nonzero. A forced process kill can leave resources for recovery.

For a retained general E2E run, preview and then confirm recovery with the exact manifest:

```powershell
node scripts/recover-e2e-run.mjs preview 'C:\path\<runId>\manifest.json'
node scripts/recover-e2e-run.mjs cleanup 'C:\path\<runId>\manifest.json' --confirm-run '<previewed-runId>'
```

Never edit a manifest, forge an ownership marker, use `cleanup:all`, or delete `.dynamodb` as recovery. If the endpoint is unavailable, restore the original loopback port and stop competing writers first. Recovery is deletion, not backup restore; retained reports and manifests do not contain recoverable test data.

Smoke recovery remains the v1 procedure in [local cleanup operations](local-cleanup-operations.md#interrupted-run-recovery). `cleanup:local` removes recorded poll data but does not prove whole-table absence; the smoke table helper is the managed teardown path.

## CI and retained diagnostics

GitHub Actions runs the foundation/fast gate and discovery, smoke, and exhaustive suites separately. Each job starts its own named DynamoDB Local service, sets no shared-table opt-in, and runs with zero retries. The cleanup step always runs before artifact upload. CI uploads reports, traces, screenshots/videos, runner output, service logs, manifests, and cleanup summaries for seven days; it does not upload `.dynamodb`, table contents, or a test-data dump. Reports and logs may contain local capability URLs, so sanitize them before sharing.

The warm targets are approximately 120 seconds for fast, 60 seconds for smoke, 90 seconds for discovery, and 300 seconds for exhaustive browser execution. The corresponding whole-command ceilings are 6, 6, 10, and 15 minutes; installation, Docker startup, artifact upload, and cleanup are outside warm targets but inside the CI job allowance. Cold runners can be slower, but a ceiling breach or cleanup failure remains a failed run.
