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

T-131 stops its own API/web processes at completion/startup failure, but leaves
v2 tables and their manifest with cleanup pending. Table teardown, full signal
handling, recovery, summary finalization and poll-artifact reconciliation belong
to T-132. A passing browser result is not evidence of completed table cleanup.
Existing v1 cleanup utilities intentionally reject v2; do not substitute broad
clear-down or edit ownership fields to delete these resources. Normal DynamoDB
Local connectivity is required before ordinary E2E can provision tables.

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

Command selection, the foundation/discovery wrapper migration and CI integration
remain T-138/T-139. Their Playwright stages already enforce the direct entry-point
guard, so wrappers that start a shared stack on the selected ports can now fail
safely until migrated. Suite selection, worker/retry defaults and performance
budgets are unchanged.

Verification: `node --test test/foundation/e2e-provisioning.test.mjs` uses controlled
clients for refusals, collisions, partial provisioning and attestation drift.
`node --test test/integration/e2e-runner.test.mjs` runs real API/Vite/Chromium
workers against a controlled DynamoDB JSON transport, using two fresh invocations
and overridden ports/region/hash configuration. It requires installed Playwright
Chromium and preserves evidence under `.devstack/`; its database is in memory.
Real DynamoDB Local interoperability remains a separate integration check.
