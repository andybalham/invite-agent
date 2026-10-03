# Clear all local application data (S-042)

## Scope and safety contract (T-095)

`npm run cleanup:all -- --endpoint http://127.0.0.1:18000` is an explicitly invoked maintenance operation. It defaults to a read-only preview. It is never called by startup, shutdown, smoke tests, or integration teardown.

The supported namespace is reserved for disposable Invite-a-Gent data:

| Table names | Scope |
| --- | --- |
| `invite-agent-local-app`, `invite-agent-local-audit` | Shared developer data, including historical smoke polls |
| `invite-agent-smoke-{app,audit}-<runId>` | Run ID exactly `YYYYMMDDtHHMMSSmmmz-` plus 32 lowercase hexadecimal characters |
| `invite-agent-test-{app,audit}-<uuid>` | Current integration fixtures; lowercase UUID with 8-4-4-4-12 hexadecimal groups |

Discovery paginates ListTables on one explicitly selected endpoint. Only exact supported names with the application's string PK/SK primary key are eligible. Whole-table deletion removes every record, secondary index, ownership marker, orphan capability, and audit event, even when empty or absent from a manifest. This deliberately authorizes all supported local data by name and schema; it does not require smoke manifests/markers and must not be used to clean just one run. Use `cleanup:local` for scoped poll/run maintenance. Custom names, legacy non-UUID integration names, prefix lookalikes, and all other tables are excluded and individually reported. No wildcard or arbitrary table override is supported. Non-default `APP_TABLE_NAME`/`AUDIT_TABLE_NAME` settings are refused rather than silently ignored.

No filesystem path is deleted. Application data persists in DynamoDB; deleting supported tables removes that logical data from its persisted database. `.dynamodb/` may also hold unrelated tables and is never removed or truncated. `.devstack/` (including process state, manifests, logs, and reports), top-level browser reports, configuration/secrets, source files, browser storage, and backups are retained. Evidence can still contain historical data or capability URLs; this command is not secure erasure and does not reclaim all disk space.

`APP_ENV` must be explicitly `local` or `test`. Supply `--endpoint` or `DYNAMODB_ENDPOINT`; there is no implicit endpoint, port-derived default, or `.env.local` loading. Only literal `http://127.0.0.1:<port>` and `http://localhost:<port>` (optional trailing slash) are allowed. Ports must be 1–65535 except HTTP's default port 80, which the existing shared endpoint guard refuses. Credentials, paths, queries, fragments, HTTPS, IPv6, alternate numeric host encodings, and non-loopback hosts fail before network access. `localhost` is pinned to `127.0.0.1`; AWS region and credentials are fixed local values, independent of ambient AWS endpoint/profile settings. HTTP redirects are not followed. A local port can still be a tunnel: the operator must ensure it serves DynamoDB Local.

## Preview, authorization, and reporting (T-096)

Stop all writers and test runners first, retaining or restarting only the intended DynamoDB Local service. There is no process stop, lock, atomic reset, rollback, or automatic backup. Inspect any recorded stack before using `npm run dev:stop`, which can itself tear down smoke tables.

```powershell
$env:APP_ENV = 'local'
npm run cleanup:all -- --endpoint http://127.0.0.1:18000 --dry-run
# Permanently deletes every eligible table shown by a fresh preview:
npm run cleanup:all -- --endpoint http://127.0.0.1:18000 --confirm 'DELETE ALL LOCAL DATA'
# Deliberate noninteractive alternative, with the same validation and preview:
npm run cleanup:all -- --endpoint http://127.0.0.1:18000 --force
```

Omitting authorization is equivalent to `--dry-run`. There is no prompt. `--confirm` requires the exact phrase shown; `--force` only replaces that phrase and bypasses no safeguards. Authorization flags conflict with each other and with `--dry-run`. Unknown, duplicate, missing-value, or malformed options fail before discovery. `--help` prints usage without connecting.

Direct `node scripts/clear-all-local-data.mjs ...` writes one JSON object per line: a `preview` before any deletion and, when authorized, a `result`. The npm wrapper adds its own command banner. Reports include endpoint, mode, warning, persisted-file exclusions, sorted table targets, categories, actions, and reasons. No record bodies or credentials are read or printed. Discovery/inspection failure aborts the whole deletion phase; an unsupported schema is reported as a failed candidate. Missing expected shared tables and unrelated names are skips. Item counts are intentionally omitted: DynamoDB metadata counts can be stale, and the operation deletes whole tables.

Only the previewed eligible names can be deleted in that invocation. Schema, active state, and creation identity are rechecked before each deletion to detect replacements. Each deletion waits for table absence with bounded retries. New tables appearing after discovery are excluded until a new invocation. Failures are reported per table while other previewed eligible tables are attempted; disappeared tables are harmless skips. Exit 0 means a successful preview or all eligible deletions completed; inspect skips for excluded data. Validation, discovery, schema/identity refusal, and partial deletion failure exit 1. Reports are not saved automatically; preserve stdout/stderr if needed. Preview is not a backup or a guarantee against concurrent changes.

## Recovery and expected state (T-097)

After successful deletion, supported tables are absent, including their indexes and audit history. Unrelated tables and all files remain. The API may report missing-table errors until reinitialized. Old poll URLs no longer resolve after initialization. With the intended local endpoint/configuration, run `npm run tables:init` to recreate empty shared tables, then start the stack with `npm run dev`. Smoke/integration fixtures recreate fresh tables on their next run. A second cleanup before initialization reports missing shared tables and no targets, exiting 0.

On partial failure, stop writers, correct the reported cause, preview again, and repeat the same deliberate authorization. Existing manifests are historical evidence and are not updated by this reset. Recovery completes deletion; restoring deleted data requires an independent backup made beforehand. Neither the script nor browser reports/manifests can restore polls or audit history. Never delete `.dynamodb/` or broaden a name pattern to bypass a refusal.

Verification uses in-memory fault fixtures and a dedicated ephemeral DynamoDB Local container without a host data mount. The real reset test must not target the developer endpoint: it starts its own container and removes only that container afterward. See `test/foundation/clear-all-local-data.test.mjs` and `test/integration/clear-all-local-data.test.mjs`.
