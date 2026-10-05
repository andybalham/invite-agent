# Local cleanup operations

S-040 / T-089–T-091 documents the scoped cleanup implementation. S-042 adds a separate [all-local clear-down contract and commands](all-local-data-cleanup.md). Start with the [README lifecycle](../README.md#local-smoke-test), [cleanup commands](../README.md#retained-local-data-cleanup), and [ports/evidence](../README.md#smoke-configuration-and-evidence). This supports the [smoke isolation contract](local-smoke-test-contract.md#isolation-repeatability-and-data-lifetime) and [local development architecture, section 16](architecture.md#16-local-development-and-testing).

## Flags and safeguards

`npm run cleanup:local -- ...` invokes `node scripts/cleanup-local-data.mjs ...`. Dry runs read DynamoDB and require a reachable database. Both examples in README explicitly preview before confirmation.

| Flag | Actual behavior |
| --- | --- |
| `--poll-id <id>` | One explicit 36-character lowercase hexadecimal/hyphen poll ID; exactly one of poll/run mode is required |
| `--run-id <id>` | Lowercase ID shaped like `20261003t123456789z-0123456789abcdef0123456789abcdef`; reads `.devstack/smoke-runs/<id>/manifest.json` |
| `--manifest <path>` | Alternate manifest in run mode, named `manifest.json` inside a directory matching the run ID; ignored in poll mode |
| `--endpoint <url>` | Poll target, otherwise `DYNAMODB_ENDPOINT`; in run mode an optional equality check against the manifest endpoint origin |
| `--app-table <name>`, `--audit-table <name>` | Poll targets, otherwise `APP_TABLE_NAME` / `AUDIT_TABLE_NAME`; ignored in run mode |
| `--dry-run` | Explicit read-only preview; omitting both confirmation flags also previews |
| `--confirm` | Authorizes record deletion without a prompt; conflicts with `--dry-run` |

Unknown flags and missing values fail. No `--all`, `--force`, `--help`, wildcard mode, or ownership bypass exists. Avoid irrelevant flags. Port variables alone do not configure this CLI; `.env.local` is not loaded. `AWS_REGION` defaults to `eu-west-2` for record cleanup; the table helper uses the manifest region. Both use dummy local credentials. Unset `APP_ENV` or `local`/`test` is permitted for record cleanup; other nonempty values fail. URL validation permits only explicit HTTP `localhost`/`127.0.0.1` with a port and no credentials, extra path, query, or fragment. It does not prove service identity behind a loopback tunnel: verify the intended DynamoDB Local instance.

Schema version 1 manifests contain owner `invite-a-gent-local-smoke`, run ID, nonce, endpoint, region, creation time, poll IDs, and ordered app/audit entries with `creationAttempted`, `owned`, and `cleanup`. Names must exactly derive from the run ID. At `PK=SMOKE_RUN#OWNERSHIP`, `SK=METADATA`, table markers must match owner, run ID, role, and nonce. Confirmed run-record cleanup checks both existing tables before any writes even if saved flags say deleted/absent/unattempted. Dry runs do not check markers and cannot prove confirmation will succeed. Poll mode has no smoke-marker requirement or table-prefix protection.

To use preserved evidence, replace the quoted placeholders with actual recorded values:

```powershell
npm run cleanup:local -- --run-id '<run-id>' --manifest 'C:\evidence\<run-id>\manifest.json' --dry-run
npm run cleanup:local -- --run-id '<run-id>' --manifest 'C:\evidence\<run-id>\manifest.json' --confirm
```

## Deletion scope and retained data

| Entry point | Scope | Retained resources |
| --- | --- | --- |
| Ordinary `dev:stop` | Recorded API/web PIDs with matching start times; Compose only when this stack started it | Developer tables/data and reused DynamoDB |
| Managed smoke shutdown, including `dev:stop` with a smoke manifest in state | Entire owned app/audit tables after API/web stop and before owned DynamoDB stop | Shared/earlier retained tables, evidence, reused DynamoDB |
| Confirmed poll cleanup | Poll app partition, referenced current capability, paginated `EVENT#` audit history | Other polls, other audit key types, tables, evidence |
| Confirmed run-record cleanup | Only manifest-recorded polls after both ownership checks | Unrecorded polls, markers, tables, evidence; manifest unchanged |
| Internal table helper `cleanup` | Entire eligible owned tables immediately, including unrecorded records | Evidence and resources outside the validated run tables |
| Confirmed `cleanup:all` (S-042) | Entire supported shared local, smoke-run, and UUID integration tables, after preview and name/schema checks | Unsupported tables and all files, including the shared DynamoDB database file and diagnostic evidence |

The app partition includes embedded dates/current state, participants, and name indexes; source-record deletion also removes index entries. Capability resolution follows the metadata's current hash and verifies its poll mapping. Missing metadata/hash reports `unresolved` rather than scanning or guessing, so old orphan capabilities may remain. Run-record cleanup never discovers lost-response/unrecorded polls; whole-table teardown discovers poll IDs only inside its owned app table before deleting it.

My polls adds a participant count to poll metadata and reads its creation-ordered GSI1 entry; it adds no separate dashboard table or cleanup target. Scoped poll deletion removes the count with metadata and DynamoDB removes the corresponding index entry. Whole-table smoke/integration teardown removes that table's index as well. API startup and `tables:init` prepare missing legacy counts and validate GSI1 before serving requests; they do not reset data. See [dashboard initialization and failure guidance](../README.md#dashboard-schema-and-existing-local-data). These data changes do not expand cleanup ownership: smoke teardown still requires exact run tables and matching markers, run-record cleanup still selects only recorded polls, and ordinary dev shutdown preserves shared data and reused DynamoDB.

T-126's dashboard smoke checkpoints use the same per-run application/audit pair and schema-version-1 manifest. The run application table includes GSI1 with string `GSI1PK`/`GSI1SK` keys and ALL projection; metadata carries the creation key and participant count. Dashboard filtering/title navigation creates no extra persisted records or audit entries. A failed dashboard assertion follows the same evidence collection and owned-table teardown as every other smoke failure. A retained-table index validation failure requires investigation under the existing startup guidance; it does not authorize clearing shared tables. No dashboard-specific cleanup command or broader discovery scope is needed.

[T-127 verification](t127-verification.md#isolation-and-failure-cleanup) records fresh integration failure-path checks and manifest-owned browser acceptance, with complete paginated table inventories before/after. Its acceptance runner uses the existing ownership/teardown mechanisms and does not change these cleanup contracts. Historical tables remain outside that run's ownership; name inventory equality is not a byte-for-byte backup or proof of every historical record.

Inspect JSON `counts`, `missing`, `unresolved`, `status`, `deleted`, `dryRun`, and `confirmationRequired`. Counts are inspection/deletion requests, not an atomic post-delete proof. Exit 0 can include unresolved capabilities or an empty manifest poll list. Missing-only poll cleanup may report `dryRun: true` even when confirmed, because no write was needed. Failures return nonzero; run mode reports failed polls and continues other recorded polls. stdout/stderr are not automatically saved and record cleanup does not update the manifest.

Pre-S-037/S-036 evidence has no ownership manifest and may use uppercase timestamp IDs invalid in current run mode. Use explicit poll IDs from summaries with the actual shared table configuration; never synthesize manifests or infer ownership from titles/prefixes. Direct Playwright and ordinary dev data also persist. Cleanup permanently removes selected audit history; append-only audit behavior applies to normal application use, not disposable local maintenance. Evidence is not a backup. For an intentional complete reset of supported local tables, use the separate [S-042 clear-down command](all-local-data-cleanup.md); its whole-table scope does not depend on manifests or recorded poll IDs.

## Interrupted-run recovery

1. Read `manifest.json` and `summary.json` in `.devstack/smoke-runs/<run-id>/`. Inspect `stage`, test/final exit codes, `failure`, `cleanupFailure`, and `diagnosticFailures`, plus each table's cleanup state/error. Logs include `startup.log`, `playwright.log` when tests ran, `shutdown.log` when wrapper shutdown ran, and `table-cleanup.log` when unfinished teardown was retried. Copied service logs/reports survive later runs; startup failures do not copy stale browser reports, but pre-launch service logs may be stale. Sanitize capability URLs in logs, media, and traces before sharing.
2. Inspect `.devstack/processes.json` before stopping the intended stack. The wrapper refuses a pre-existing stack before creating a run and refuses foreign manifest paths during shutdown. `dev:stop` does not perform that foreign-manifest comparison; review state yourself. It stops only PID/start-time matches, but a recorded smoke manifest triggers immediate table teardown. Stop writers before any cleanup; there is no transaction, rollback, or concurrency lock.
3. Restore the manifest's exact local DynamoDB endpoint. If its owned container was stopped despite table failure, restart DynamoDB only using the original `DYNAMODB_PORT` and `docker compose -p invite-a-gent-local up -d dynamodb`. Avoid changing ports while that fixed Compose project serves another stack. Another smoke run selects fresh tables and cannot recover the old run.
4. For record cleanup, preview again and rerun the same confirmed command after correcting the cause. Batches contain at most 25 requests, with bounded retries for unprocessed items. Metadata is deleted last, preserving token references for retry after dependent-write failure. Missing app/audit tables are handled independently. Inspect unresolved entries even after exit 0.
5. To permanently remove an interrupted run's whole disposable tables, inspect its manifest/ownership evidence and stop writers first. The internal command below has no dry run, confirmation, or `APP_ENV` restriction. It validates local targets and matching markers, discovers lost-response IDs, deletes tables independently, saves results/errors, and returns nonzero if any fail.

```powershell
# Immediately destructive: whole owned tables, including unrecorded polls/history.
node scripts/smoke-run-resources.mjs cleanup '.devstack/smoke-runs/<run-id>/manifest.json'
```

The helper attempts only `creationAttempted: true` entries not already `deleted`/`absent`; completed entries are skipped, including any later replacement table. A failure may still delete the other owned table. Matching persisted markers can recover a lost acknowledgement; unmarked creation, mismatched markers, or missing/corrupt manifests require investigation. Never edit flags, identity, nonce, or markers to force deletion. There is no supported bypass.

Stop attempts Compose shutdown even when table cleanup fails. Successful shutdown can remove process state despite a table error; failed Compose shutdown retains it. `recordedStackStopped` describes state-file absence, not proof of table/process absence. Abrupt termination can leave resources for inspection. Recovery means finishing deletion, not restoring it; restore only from an independently retained backup. No cleanup backup/restore command exists. Do not remove `.dynamodb/`, unrelated tables, or unrelated processes as recovery.

## Acceptance traceability and verification

| Obligation | Documentation / existing contracts | Implementation / verification |
| --- | --- | --- |
| T-089: exclusive schemas, ownership, manifest, teardown, reuse, ports and failures | README lifecycle/configuration; smoke isolation; architecture 16.3, 16.5–16.7 | [resources](../scripts/smoke-run-resources.mjs), [startup](../scripts/Start-DevStack.ps1), [stop](../scripts/Stop-DevStack.ps1), [wrapper](../scripts/Run-SmokeTests.ps1), [poll recording](../test/e2e/smoke-fixtures.ts); [resource tests](../test/foundation/smoke-resources.test.mjs), [wrapper tests](../test/foundation/smoke-wrapper.test.mjs), [dev harness](../test/foundation/dev-harness.test.mjs) |
| T-090: explicit modes, confirmations, pagination, retained data, refusals and recovery | README cleanup; flags/scope/recovery above; [Epic 11 source](../.worktracker/entities/E-011-e11-ephemeral-smoke-data-and-safe-local-cleanup.md) | [record CLI](../scripts/cleanup-local-data.mjs), [package alias](../package.json); [cleanup contracts](../test/foundation/cleanup-local-data.test.mjs), [fault/recovery verification](../test/foundation/cleanup-verification.test.mjs), [real DynamoDB tests](../test/integration/cleanup-local-data.test.mjs) |
| T-091: diagnostics, all destructive entry points, accurate evidence and limits | This guide; [historical S-036 evidence](local-smoke-test-contract.md#s-036-verification-evidence); [local requirements](../.worktracker/requirements/source.md) | Wrapper/stop/resource helper/record CLI; current verification below |

These obligations support local isolation/unconditional cleanup without adding SM-01–SM-11 application checkpoints or production AWS/Cognito assurance. Fault/resource tests use controlled clients; wrapper tests stub startup/browser/shutdown. They must not be reported as real browser/Docker failure experiments. Historical S-036 execution evidence remains historical.

### S-040 verification evidence — 3 October 2026

Executed on Windows with Node v24.19.0 against the existing checkout/build artifacts:

- `node --test test/foundation/cleanup-local-data.test.mjs test/foundation/cleanup-verification.test.mjs test/foundation/smoke-resources.test.mjs test/foundation/dev-harness.test.mjs`: exit 0, 24 passed, 0 failed/skipped, approximately 2.6 seconds. Covers preview/confirmation, pagination, unrelated-data preservation, both-table ownership checks, missing tables/metadata, partial/unprocessed writes, reruns, manifest refusal, distinct table lifecycles, and local harness contracts.
- Relative Markdown link/heading-anchor validation across README, this guide, and the smoke contract: 35 links checked, exit 0.
- `node scripts/check-format.mjs`, `node scripts/check-production-boundaries.mjs`, and `git diff --check`: passed. The repository format script checks code/JSON rather than Markdown; link validation and diff review provide the documentation checks.

The user requested completion after the current documentation checks. No new build, wrapper fault-test execution, real DynamoDB integration, smoke/browser journey, broader regression suite, lint, security check, or full quality gate was run for S-040. The existing wrapper/integration tests are traceability references, not new execution evidence. No confirmed deletion targeted retained developer data, and no background check was left running. Tracker completion and generated summaries are updated exclusively through the file-kanban MCP API.
