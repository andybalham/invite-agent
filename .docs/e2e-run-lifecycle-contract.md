# Per-run E2E resources, teardown, and recovery

## Scope and delivery status

T-129 / S-050 / E-014 defines the resource lifecycle required by the [T-128 isolation boundary](e2e-isolation-contract.md). It covers every ordinary browser invocation, including smoke, discovery, foundation browser stages, direct Playwright entry points, workers, and retries. Suite selection does not change ownership. T-128 remains authoritative for shared opt-in, environment resolution, endpoint restrictions, configuration propagation, and checks before any writer.

This document specifies future behavior. T-131 implements provisioning/configuration, T-132 implements teardown/recovery diagnostics, and T-133 verifies them. Command and CI integration belong to T-138/T-139. T-129 adds no runtime runner, manifest parser, cleanup command, process lock, or tests of future behavior.

The reference infrastructure is [smoke resources](../scripts/smoke-run-resources.mjs), [smoke orchestration](../scripts/Run-SmokeTests.ps1), [stack startup](../scripts/Start-DevStack.ps1), [stack shutdown](../scripts/Stop-DevStack.ps1), [table initialization](../backend/src/data/initialize-tables.ts), and [integration fixtures](../test/support/integration-fixture.mjs). Reuse their exclusive creation, normal schemas, loopback clients, ownership checks, bounded deletion waits, independent cleanup attempts, and separate primary/cleanup error reporting when implementing this contract. Their current limitations are listed below; referencing them does not claim the new contract is enforced.

## Identity, names, and ownership

One coordinator owns one application/audit pair for one invocation. Generate a fresh lowercase run ID from UTC `yyyyMMddTHHmmssfffZ` plus a hyphen and a random UUID with its hyphens removed: `20261006t174159199z-0123456789abcdef0123456789abcdef`. Validate the exact shape `^\d{8}t\d{9}z-[a-f0-9]{32}$` and a real UTC timestamp. Generate a separate random lowercase UUID `ownershipNonce`; neither timestamp, organiser ID, nor worker index is proof of ownership.

| Resource family | Application / audit names | Owner and marker key | Manifest |
| --- | --- | --- | --- |
| General isolated E2E (required) | `invite-agent-e2e-app-<runId>` / `invite-agent-e2e-audit-<runId>` | `invite-a-gent-local-e2e`; `PK=E2E_RUN#OWNERSHIP`, `SK=METADATA` | Version 2, `.devstack/e2e-runs/<runId>/manifest.json` |
| Existing managed smoke (implemented) | `invite-agent-smoke-app-<runId>` / `invite-agent-smoke-audit-<runId>` | `invite-a-gent-local-smoke`; `PK=SMOKE_RUN#OWNERSHIP`, `SK=METADATA` | Version 1, `.devstack/smoke-runs/<runId>/manifest.json` |
| Existing Node integration fixtures (implemented) | `invite-agent-test-app-<uuid>` / `invite-agent-test-audit-<uuid>` | In-process successful-create tracking; no persisted marker/manifest | No durable interrupted-run recovery contract |

The general family applies to all suites launched through the future E2E coordinator, including smoke selection. The existing smoke wrapper continues using v1 until explicitly adapted; do not rename its retained manifests/tables or make its parser accept v2 by accident. Integration fixture changes are outside T-129. A suite, worker, or retry must never create its own alternative pair or adopt an earlier run's pair. A fresh top-level rerun gets a fresh run ID, nonce, manifest directory, and tables, even after failure.

Derive names only from the validated family and run ID. Both names must be distinct and meet DynamoDB's existing name constraints. Reject either protected development name (`invite-agent-local-app`, `invite-agent-local-audit`) in either role, any custom shared name, cross-run pair, unexpected prefix, or role mismatch. Preflight reads can check collisions; exclusive `CreateTable` is still required because a prior absence check cannot prevent races. Any collision fails startup; do not reuse, reset, migrate, tag, or add a marker to the existing table.

Both tables retain string `PK`/`SK` keys and `PAY_PER_REQUEST`; the app table retains `GSI1` with string `GSI1PK`/`GSI1SK` keys and ALL projection. No separate dashboard table is owned. After successful exclusive creation and readiness, conditionally insert the ownership item, requiring the marker key to be absent. Its DynamoDB string attributes are exactly:

```json
{
  "PK": { "S": "E2E_RUN#OWNERSHIP" },
  "SK": { "S": "METADATA" },
  "owner": { "S": "invite-a-gent-local-e2e" },
  "runId": { "S": "20261006t174159199z-0123456789abcdef0123456789abcdef" },
  "nonce": { "S": "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee" },
  "role": { "S": "app" }
}
```

The audit marker differs only in `role`. It is not a poll, capability, audit event, or GSI1 entry. Application writers, seeders, and record cleanup must preserve it. Prefixes, table emptiness, tags, manifest `owned: true`, and creation intent alone never authorize deletion. Before test writes, require both schemas and strongly consistent marker reads matching all fields at the manifest's exact endpoint/region. Before deleting each table, repeat its live marker and creation-identity check. The nonce is an accidental-ownership guard within the trusted local test tooling, not an authorization boundary against a malicious local writer.

Capture `CreationDateTime` as epoch milliseconds from `DescribeTable`, plus `TableId` when supplied, following [the existing clear-down identity convention](../scripts/clear-all-local-data.mjs). Record this immutable `creationIdentity` before destructive work and compare it on recovery. If a marker was saved but its acknowledgement or manifest update was lost, a matching live marker can establish ownership and allow the missing creation identity to be recorded. Missing/mismatched markers or changed recorded creation identity require refusal. Never attach a new marker to an unmarked table during cleanup.

## Version 2 manifest and run journal

Create the evidence directory and manifest exclusively before the first resource write; an existing path fails instead of overwriting evidence. The canonical absolute path must end in `<runId>/manifest.json`, remain within this run's evidence directory, and not alias another run through links. Recovery may use a preserved directory at another location, still named `<runId>` and containing `manifest.json`, after explicit validation of the selected path and targets.

The coordinator resolves configuration once and propagates `E2E_RUN_ID` and absolute `E2E_RUN_MANIFEST_PATH` with the exact T-128 environment to services and test children. The manifest is authoritative for targets. Neither environment table overrides nor a copied manifest alone authorizes a new ordinary invocation to use an old pair: T-131 must verify the current coordinator/API handshake. Existing smoke keeps `SMOKE_RUN_MANIFEST_PATH` until migrated.

Use schema version 2 for the new family, because it requires lifecycle/process/recovery fields not validated by the smoke v1 parser. A v2 reader must reject unsupported versions and inconsistent required fields before any mutation; do not silently coerce v1, default missing fields, or reinterpret its owner/marker family. If downstream tooling explicitly supports v1 recovery, dispatch to its existing validation and scope rather than relabelling it as v2.

| Required field | Content and meaning |
| --- | --- |
| `schemaVersion`, `owner`, `mode` | `2`, `invite-a-gent-local-e2e`, `isolated`; shared mode never creates an owned-resource manifest. |
| `runId`, `ownershipNonce`, `createdAt` | Valid identity, separate UUID nonce, ISO UTC manifest creation time; immutable. |
| `endpoint`, `region` | Canonical validated loopback HTTP origin and resolved nonempty AWS region; immutable across children and recovery. Clients use explicit local dummy credentials. |
| `configuration` | `appEnv: test`, `authMode: local`, effective DynamoDB/API/web ports, API/web origins, and public base URL from T-128. No credentials, token-hash key, raw capabilities, or participant data. |
| `suite`, `startedAt`, `finishedAt` | Actual test selection and ISO UTC execution times; `finishedAt` is null until orchestration ends. Selection records execution context, not resource ownership. |
| `phase` | One of `prepared`, `provisioning`, `starting`, `testing`, `teardown`, `finished`, `interrupted`. Persist before entering a phase; `finished` alone never proves cleanup succeeded. |
| `pollIds` | Deduplicated validated poll UUIDs acknowledged by fixtures/seeders. Advisory diagnostic inventory, never an allow-list limiting whole-table deletion. |
| `tables` | Exactly two ordered entries, `app` then `audit`, with exact derived names and the per-table fields below. |
| `coordinator` | Original coordinator PID and `startTimeUtcFileTime`, run ID, and canonical manifest path, recorded before provisioning. Recovery uses this identity to distinguish a live invocation from a stale record or reused PID. |
| `services` | Run-owned API/web process records (role, PID, start time in the existing `startTimeUtcFileTime` format, run ID, manifest path), plus DynamoDB `reused` or `started` state, exact endpoint/container/Compose identity, and backing-storage configuration when started. Record an empty list before launch. |
| `cleanupAttempts` | Append-only attempt records: attempt ID, start/finish times, automatic/recovery origin, phase results, per-role observations/errors, and overall `complete`/`failed`/`interrupted` outcome. An unfinished attempt has null finish/outcome. |
| `cleanupFinishedAt` | Null initially; last attempt end time, including a failed attempt, matching the smoke convention. It is not a success flag. |

Each table entry contains `role`, `name`, boolean `creationAttempted` and `owned`, nullable `creationIdentity`, boolean `deletionAttempted`, nullable `deletionRequestedAt`, `cleanup` (`pending`, `deleted`, `absent`, `failed`), and nullable `cleanupError`. Begin with false flags, null optional evidence, and `pending`. Record creation intent before calling DynamoDB. `owned` records a successful marker verification, but live evidence remains required. Record deletion intent and the verified creation identity before sending `DeleteTable`; intent does not prove the request succeeded. Save the result after each table independently, so an audit failure cannot erase the app outcome. A cleanup error identifies role/name, operation, error category/message, and safe next action; do not serialize raw SDK requests containing secrets.

The coordinator is the sole manifest writer. Workers/fixtures send poll IDs and diagnostics to it, or produce separate worker artifacts for it to merge. Serialize read/modify/write operations and preserve a union of poll IDs; atomic rename alone does not prevent lost updates. Write updates to a uniquely named temporary sibling and rename them atomically, following the smoke helper. Recovery acquires exclusive per-run coordination only after the original coordinator/writers are proved stopped; concurrent cleanup is refused. A stale coordination record does not itself authorize takeover or process termination.

Failure to persist initial identity or creation intent blocks creation. Failure to save later state halts test startup/writes and records an error in available logs. Teardown can still use the last validated immutable manifest plus matching live markers; if deletion intent cannot be persisted, do not send a new delete request. Continue safe read-only inspection and preserve diagnostics. Temporary/incomplete JSON is never treated as a replacement manifest. Hard termination may leave the last phase/attempt unfinished; recovery handles this as unknown completion rather than inventing a passing outcome.

## Teardown phases and outcomes

Register the coordinator's teardown/finally path before provisioning begins. The same path runs after startup or fixture failure, assertion failure, Playwright timeout, normal completion, and catchable interruption. Individual browser workers do not own table teardown. Each phase has a bounded deadline and reports its own failures; retain the primary startup/test error.

| Phase | Required behavior |
| --- | --- |
| 1. Quiesce and preserve browser evidence | Prevent new setup/seeding, cancel or finish browser workers, drain/close their contexts within a deadline so traces/media/reports flush. Save test result/interruption and available diagnostics. Failed collection does not suppress later safe cleanup. |
| 2. Stop run writers | Capture available service logs, then stop only this run's API/web processes, verifying run/manifest identity and PID/start time. Capture final logs after shutdown. Never stop a caller's stack, a reused PID, or services identified only by their port. If writers cannot be proved stopped, retain state and defer table deletion with an error. |
| 3. Remove proven owned tables | Keep DynamoDB reachable. Validate manifest/endpoint and inspect both exact names; for each eligible table, establish live ownership/creation identity, persist delete intent, delete it, and poll `DescribeTable` to confirmed absence. Attempt the other proven owned table even if one fails. Never initialize, repair, scan unrelated tables, or recreate a missing table. |
| 4. Release owned services | Dispose clients and stop only a DynamoDB service exclusively started by this invocation and still matching its recorded identity. A reused service stays running. If table cleanup failed, retain the owned DynamoDB service for recovery and record its state; stopping it must not strand recovery. Never use broad Compose shutdown against a shared project. |
| 5. Finalize evidence | Persist per-table/phase results, attempt finish time, service state, summary, primary and secondary failures, final exit code, and recovery instructions. Keep manifest, reports, logs, and recovery history on success and failure. |

Tables never created remain `creationAttempted: false`, `cleanup: pending`; read-only inspection must confirm they are absent before reporting no leftovers. For an attempted table, confirmed absence without a known acknowledged delete is `absent`; a requested delete followed by confirmed absence is `deleted`. A network error, timeout, or ownership refusal is `failed`, never `absent`. A successful `DeleteTable` response is insufficient: completion requires `DescribeTable` to return `ResourceNotFoundException` for the selected local service.

For previously `deleted`/`absent` entries, recovery performs a read-only absence check. If a table now exists under that name, report a replacement/conflict and refuse deletion, even if a saved flag says `owned`. Never reset completed entries to pending to consume a replacement. The run is clean only when both exact names are confirmed absent and owned writers are stopped; process-state file absence, zero polls, an empty table, and `cleanupFinishedAt` are insufficient. An eligible table with no live marker remains for investigation even when exclusive creation might have succeeded.

Table removal deletes every poll partition, participant/name index, capability, dashboard GSI entry, ownership item, and audit event in the owned pair, including setup data not recorded in `pollIds`. No record-by-record deletion or full-partition snapshot is required for teardown. An optional paginated `POLL#`/`METADATA` inventory may fill lost-response IDs only inside a verified owned app table; its failure is diagnostic and must not block otherwise safe whole-table removal. Do not expand this into performance/seed implementation (T-134/T-135).

Use the existing smoke outcome convention: if tests pass but teardown fails, final exit is `1`; if startup/tests already failed, preserve their nonzero exit and report cleanup separately. Catchable interruption is always nonzero and records the signal/reason, even if teardown completes. Missing/copy-failed diagnostics are reported separately and do not turn an otherwise passing, fully cleaned run into a failure. Failure to persist required ownership/cleanup results is an orchestration failure. Record `testExitCode: null` when tests did not finish; never fabricate a successful browser result.

## Interruption and report preservation

On Ctrl+C or another catchable termination, the coordinator records interruption if possible, stops dispatching tests, and enters the bounded teardown path once. Avoid racing signal handling with a second finally teardown. A second interruption, forced process kill, machine crash, or unreachable DynamoDB can prevent cleanup. This is an incomplete run requiring recovery, not a guarantee that a finally handler always executes.

Creation interrupted before a persisted marker leaves ambiguous ownership and cannot be automatically deleted. A persisted marker with a lost acknowledgement is recoverable by exact nonce/role/run matching. If deletion was interrupted, inspect the recorded creation identity and live state: `ACTIVE` requires fresh marker validation before retrying; `DELETING` permits only bounded read-only waiting for the already requested deletion when its identity matches and deletion intent was persisted. Do not issue another destructive call based only on a `DELETING` name or a vanished marker. Without sufficient evidence, refuse and retain the error. On timeout/unreachable service, record failure and leave recovery retryable.

Keep all evidence in `.devstack/e2e-runs/<runId>/`, which follows the existing ignored `.devstack/` convention. Configure Playwright to write directly into this run's `test-results/` and `playwright-report/`, with separate test/worker/retry artifacts; top-level folders replaced by another run are not durable evidence. Retain existing trace-on-failure, screenshot-on-failure, and video-on-failure policies. Record `startup.log`, `playwright.log` if launched, `service-logs/`, `shutdown.log`, `table-cleanup.log`, `manifest.json`, and `summary.json` where available. Do not attribute old browser/service files to a startup failure before those processes launched. Missing artifacts need explicit unavailable/error status.

`summary.json` preserves the existing smoke concepts: run/manifest identity, stage/timestamps/elapsed time/ports, test and final exit codes, primary `failure`, `cleanupFailure`, and `diagnosticFailures`. Add effective mode, interruption, phase outcomes, table absence results, remaining resource names/service identities, and whether recovery is required. Keep this human-readable summary distinct from the ownership manifest. `recordedStackStopped` is only a state observation; include actual owned-process termination and table-absence evidence. Reports may contain public URLs or personal data; never log token-hash keys or credentials, and sanitize traces/media/capabilities before sharing.

Preserve the original summary/report after completion or failure. Recovery appends a uniquely identified log/result under `recovery/<attemptId>/` and a new manifest attempt; it does not rewrite a failed browser report as passing. Table deletion must never remove the evidence directory, shared `.dynamodb/` database file, unrelated reports, or any database backup. Evidence is not a backup; recovery completes deletion and cannot restore deleted application/audit history.

## Safe recovery contract

T-132 must expose a deliberately selected per-run recovery operation with a read-only inspection/preview followed by explicit confirmation of the exact manifest/run. This is an interface requirement, not an available command in T-129. No new CLI spelling is promised here. Automatic finally cleanup needs no interactive confirmation because it removes the invocation's own resources; manual recovery must not discover and delete arbitrary runs by prefix, age, glob, table listing, or inherited environment values.

1. Select and validate the original manifest and preserved summary/logs, including supported version/family, immutable run/nonce, exact names, endpoint/region, and creation/deletion evidence. Missing/corrupt manifests require investigation; never synthesize identity from table names or titles, edit flags/nonces, forge markers, or offer an ownership bypass.
2. Inspect the original coordinator and writer identities. Refuse recovery while its coordinator is live; if abandoned writers remain, stop only verified run-owned processes. Prove that the original coordinator and all writers have stopped, then acquire exclusive recovery coordination for this run. Do not use an unrelated `.devstack/processes.json`, PID alone, occupied ports, or a stale lock as authority. Preserve original evidence before changing resource state.
3. Reach the original DynamoDB Local service and backing database at the recorded endpoint/region with explicit dummy credentials. If restarting an exclusively owned stopped service is necessary, use its recorded service identity and storage/port configuration; do not reconfigure another stack or create empty application tables to make the target appear clean. An unavailable or uncertain service means failure/unknown, not successful absence.
4. Preview both names' existence, schemas, marker and creation identity, prior cleanup state, owned writer/service state, and the exact eligible deletion set. Read-only preview must include ownership checks; report missing, mismatched, replaced, unmarked, or deleting targets. Validate again after confirmation. A table-specific refusal may leave the other proven owned table eligible; report the partial scope explicitly. A global manifest/endpoint/process safety failure permits no deletion.
5. For confirmed eligible tables, retry the teardown phases with the original identity. An already missing table is an idempotent success. For an unfinished table, revalidate ownership before each new delete; for a matching already-deleting table, only resume the bounded wait. Never adopt a newly created/replacement table or reuse the old pair for tests. A failure in one table must still allow the other safe attempt.
6. Persist the new attempt and recovery result, preserving the previous errors. Return nonzero while any required table/service cleanup remains failed or unknown, with exact remaining targets and the next safe step (restore connectivity, stop verified writers, or investigate ownership). On success record both table absences, writer termination, and service disposition. A fresh E2E run still provisions a different pair.

Shared mode under `E2E_ALLOW_SHARED_TABLES=1` retains caller-owned tables/services and records mode in diagnostics, as T-128 requires. It creates no owned-resource manifest and never enters automatic table teardown or this recovery deletion path. Scoped poll cleanup is a separate deliberate maintenance workflow.

### Existing commands and compatibility limits

The [local cleanup operations guide](local-cleanup-operations.md#interrupted-run-recovery) remains the operative procedure for smoke v1. `cleanup:local --run-id` deletes only recorded smoke polls, retaining tables/markers and leaving the manifest unchanged; it cannot establish the no-leftovers condition for E2E. The internal smoke table helper deletes eligible whole smoke tables immediately with no preview/confirmation and understands v1 only. Neither accepts the proposed E2E v2 manifest today. The [all-local clear-down utility](all-local-data-cleanup.md) has a separately authorized broad scope and currently excludes the new E2E naming family; it must not be substituted for per-run recovery or broadened in T-129.

Current smoke updates are atomic but do not serialize concurrent writers. Its cleanup skips saved deleted/absent entries, collects poll IDs before deletion (a scan failure can block deletion), and may stop owned Compose/remove process state after table failure. Integration tracking survives assertion/setup failure within the process, but has no durable marker or manifest after a hard kill. Existing Playwright reports use shared top-level directories. These are implementation differences for downstream work, not reasons to weaken this contract or claims that general recovery already exists.

## Downstream acceptance and verification

Use controlled doubles for refusal/fault paths and disposable local resources for real deletion. Never exercise a destructive negative probe against actual developer data. Record before/after evidence for the protected pair, a custom caller-owned pair, and another run's tables/data; merely comparing table names cannot prove records were preserved.

| Scenario | Required evidence / owner |
| --- | --- |
| Two runs, parallel workers, retries, custom ports/region | Distinct top-level pairs; all children share only their invocation's validated pair; serialized manifest updates retain every acknowledged poll ID. T-131/T-133. |
| Collision, wrong family/role/nonce/schema/creation identity, stale manifest/API, protected or custom shared targets | Refusal before rejected-target writes; no marker adoption, migration, seed, or deletion. T-131/T-133 and T-128 gates. |
| Failure after first creation, before marker, after marker but before acknowledgement/save, or before tests start | Teardown registered early; marked owned resources removed, ambiguous resources retained with exact errors, no false pass or stale report attribution. T-131/T-132/T-133. |
| Pass, assertion/setup failure, timeout, Ctrl+C, hard termination | Automatic bounded cleanup where possible; primary error retained; forced termination leaves enough persisted context for safe recovery. T-132/T-133. |
| One delete fails, response lost, deletion remains in progress, service unreachable, manifest save fails | Other safe steps continue; per-table failures and unfinished intent persist; bounded wait/retry; no success based on connectivity failure. T-132/T-133. |
| Recovery rerun, simultaneous recovery, vanished/replaced marker, replacement under a completed name | Idempotent missing-table handling; exclusive recovery; live ownership/identity checks; replacements preserved; no forged markers or flag reset. T-132/T-133. |
| Diagnostic copy/flush error, foreign or reused PID, reused DynamoDB, owned-service cleanup failure | Separate diagnostics; only proved owned processes stopped; database stays reachable when table cleanup fails; original reports and all recovery attempts retained. T-132/T-133. |
| Shared opt-in, old smoke v1, Node integration fixtures, broad clear-down | Existing scope remains explicit; no shared automatic deletion, implicit manifest conversion, or broader recovery discovery. T-131/T-132/T-139. |

Existing reference tests are [smoke resource faults](../test/foundation/smoke-resources.test.mjs), [wrapper faults](../test/foundation/smoke-wrapper.test.mjs), [record cleanup/recovery](../test/foundation/cleanup-verification.test.mjs), [integration fixture faults](../test/foundation/integration-fixture.test.mjs), and [real DynamoDB integration cleanup](../test/integration/integration-cleanup.test.mjs). They verify existing mechanisms, not the future v2 runner. T-133 adds the above acceptance evidence; T-140 performs final repeatability/no-cruft verification. Performance budgets, seeding optimization, suite commands, and CI migration remain in their own tasks.
