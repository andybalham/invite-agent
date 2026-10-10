# E2E provisioning and configuration (T-131)

Ordinary `npm run test:e2e` and direct Playwright invocations now create a fresh
`invite-agent-e2e-app-<runId>` / `invite-agent-e2e-audit-<runId>` pair. Inherited
development table names are replaced. The coordinator builds the repository,
exclusively provisions both tables, verifies their schemas and ownership markers,
and starts its own API and Vite processes. API/web ports must be free; choose
different `API_PORT` and `WEB_PORT` values when browser development is running.
The existing DynamoDB Local service must already be reachable at the resolved
endpoint; this coordinator does not launch or stop Docker/DynamoDB.

The coordinator resolves the [T-128 configuration](e2e-isolation-contract.md)
before any database writes. `localhost` endpoints are pinned to `127.0.0.1`.
Explicit endpoint/port conflicts, remote endpoints, production environments,
invalid opt-in values and invalid routing are refused. Node 24 is required for
the smoke configuration helper's native TypeScript loading. Environment files
are not loaded automatically.

The local-only `GET /health/e2e?challenge=<uuid>` handshake reports safe effective
configuration and a random API instance ID. A challenge proof verifies that the
API and repository hooks share the hash key without returning that key. Preflight
checks both the API and its web proxy, the current coordinator identity, exact
manifest configuration and strongly consistent ownership reads. Each test and
repository helper must pass this gate before setup. Managed API startup does not
initialize or migrate tables. Browser/API fixture requests also carry the pinned
instance ID so a restarted API refuses their writes.

Version 2 evidence is saved directly under `.devstack/e2e-runs/<runId>/`, including
`manifest.json`, startup/shutdown logs, service logs and Playwright reports/results.
Only the coordinator writes the manifest; smoke selection records poll IDs in
separate test-attempt artifacts for later coordinator reconciliation. Partial
provisioning records per-role creation intent and acknowledged live ownership.
The manifest never contains the token-hash key or credentials.

T-132 now stops verified run-owned API/web writers and deletes only live-proven
owned tables after Playwright closes workers/contexts. Startup failures enter the
same cleanup path. Catchable SIGINT and SIGTERM use Playwright's interruption
finalizers; a forced kill or second interruption can still leave recovery work.
Each table's deletion intent is saved before the request, and completion requires
confirmed absence. Ownership mismatches and unmarked partial creations are
retained for investigation. An independent failure does not suppress cleanup of
the other eligible table. Reused DynamoDB stays running.

The retained `summary.json` records browser and cleanup outcomes separately,
remaining resources, diagnostic failures and recovery instructions. The reporter
finalizes the browser outcome after global teardown. A cleanup failure makes a
passing browser invocation fail. Worker poll artifacts are merged into the
manifest without scanning tables. Reports, traces/media, startup/shutdown logs,
`playwright.log`, service logs, `table-cleanup.log` and cleanup attempt history
remain in the run directory; missing artifacts are reported where available.

For a retained v2 run, build first, then select its exact absolute manifest:

```powershell
node scripts/recover-e2e-run.mjs preview 'C:\path\<runId>\manifest.json'
node scripts/recover-e2e-run.mjs cleanup 'C:\path\<runId>\manifest.json' --confirm-run '<previewed-runId>'
```

Preview is read-only and reports eligible, absent, deleting and refused targets
plus writer identities. Confirmation revalidates the original coordinator is
stopped and the writer identities, acquires exclusive per-run coordination, then
stops only matching abandoned writers. Live ownership/creation identity is
checked again before a new delete. A matching already-deleting table with saved
intent permits only bounded read-only waiting. Completed names are rechecked for
absence; replacements are retained even when an old marker was copied.

Recovery appends an attempt and `recovery/<attemptId>/` logs/summary without
overwriting the original browser report or summary. Connectivity/ownership errors
remain retryable after the underlying issue is resolved. A concurrent recovery
or leftover `recovery.lock` is refused. After hard termination during recovery,
inspect the lock and prove its holder and original writers stopped before
manually removing that exact lock; a stale lock alone grants no takeover.
Existing v1 cleanup utilities intentionally reject v2; do not substitute broad
clear-down, edit ownership fields or add a marker to an unmarked resource.
Normal DynamoDB Local connectivity is required for provisioning and recovery.

For deliberate shared debugging, supply exactly `E2E_ALLOW_SHARED_TABLES=1`, with
`CI` unset/empty, explicit `APP_ENV=local` or `test`, an explicit local
`DYNAMODB_ENDPOINT`, and both table names. Match ports, region, public base URL
and hash-key settings to the caller's stack. Playwright warns with the selected
targets and verifies the running API/proxy configuration. It creates no tables
or owned-resource manifest and stops no caller services. Shared debugging can
retain data. Old running APIs without attestation fail preflight and require a
deliberate restart by their owner.

The smoke wrapper retains its v1 family, manifests, reports and cleanup. It now
validates configuration before startup, propagates all effective settings and
requires its live wrapper coordinator for API/fixture preflight. Managed smoke
refuses shared opt-in. It does not convert retained v1 runs into v2.

T-138 exposes the fast, discovery, smoke, and exhaustive commands. T-139 runs
those selections in separate CI jobs against job-local DynamoDB Local and retains
diagnostics without retaining the database directory. The foundation and
discovery browser stages now enter the isolated coordinator directly; they do not
start or stop a caller-owned development stack. Suite selection, worker/retry
defaults and performance budgets remain as documented in the suite contract.

Verification: `node --test test/foundation/e2e-provisioning.test.mjs test/foundation/e2e-cleanup.test.mjs`
uses controlled clients for refusals, collisions, partial provisioning,
acknowledgement loss, interruption, writer/ownership drift and retryable cleanup.
`node --test test/integration/e2e-runner.test.mjs` runs real API/Vite/Chromium
workers against a controlled DynamoDB JSON transport, using two passing runs,
intentional browser failure, partial cleanup/recovery and catchable interruption
with overridden ports/region/hash configuration. It requires installed Playwright
Chromium and preserves evidence under `.devstack/`; its database is in memory.
Real DynamoDB Local interoperability remains a separate integration check.

## T-133 cleanup verification

`node --test test/foundation/e2e-cleanup-isolation.test.mjs` adds controlled
connectivity outages, repeated/idempotent recovery, ownership changes between
inspection and deletion, and simultaneous recovery with one actual lock holder.
It compares protected and unrelated-run records, original binary evidence, and
the append-only cleanup journal rather than treating a delete response as absence.

`node --test --test-concurrency=1 test/integration/e2e-runner.test.mjs test/integration/e2e-cleanup-local.test.mjs`
checks real API/Vite/Chromium invocations against both a controlled JSON transport
and DynamoDB Local. The Docker test creates its own named container from the
already-installed `amazon/dynamodb-local:2.6.1` image, publishes a random loopback
port, uses `-inMemory -sharedDb`, and mounts no filesystem data. It never consumes
the caller's database endpoint. Its exact default development names and custom
caller names are synthetic copies inside that private database, alongside another
manifest-owned run. The test removes only its exact container ID in an after hook.
Docker Engine, PowerShell, built workspaces and installed Chromium are required;
missing dependencies fail the check instead of silently skipping it.

The opt-in `cleanup-isolation.spec.ts` probe creates drafts through the UI and
verifies untracked participant, name, capability and audit fixture records. Two
successive two-worker runs must use distinct pairs, reconcile every poll artifact,
stop owned writers and leave both tables absent. Paginated consistent snapshots
prove every protected and unrelated-run record remains unchanged. Assertion,
per-test timeout and browser-launch failures retain the primary outcome, HTML
report, runner/service logs, and browser trace/screenshot/video when a browser
started. Subsequent runs and recovery must retain every original artifact's SHA-256.
The JSON transport also checks catchable interruption and a diagnostic retry:
the original failure and both attempts remain evidence, and the reporter returns
a failed process status matching the summary even when Playwright labels the
recovered retry flaky.

An injected audit-delete failure over the real database proves independent app
cleanup, read-only preview, exact-run confirmation, deletion of only the remaining
audit table, and an idempotent second recovery. All original error history remains.
Evidence stays under `.devstack/e2e-runs/`; temporary manifests used by controlled
fixtures are removed by their registered hooks. This verifies the runner lifecycle,
not suite budgets or final full-suite acceptance (T-137/T-140).
