# E2E isolation boundary

## Scope and delivery status

T-128 / S-050 / E-014 specifies the safety boundary for browser E2E execution. The requirements below apply to `npm run test:e2e`, direct `npx playwright test` invocations (including headed/UI/debug runs), the browser stage of `test:discovery`, `test:foundation`, and smoke runs. Suite selection, worker count, retries, fresh organiser identities, and read-only assertions do not relax the boundary: setup or a browser action can still write.

This is a specification, not runtime enforcement. As of T-128, `playwright.config.ts` only selects tests and browser settings; it neither provisions tables nor checks their ownership. The direct E2E helpers and local API still default to the shared table names. `Run-FoundationTests.ps1` starts that default stack before invoking Playwright, including in the current CI workflow. `verify-my-polls-discovery.mjs` inherits the calling shell and runs browser cases against its existing stack. Neither command is currently an isolated E2E runner.

The existing `npm run test:smoke` wrapper is the available managed path: it provisions manifest-owned smoke tables and passes their names to its API and helpers. It refuses a recorded running stack before startup. T-129 defines the general run naming/manifest/ownership contract; T-131 implements provisioning, API configuration, and safety checks; T-132 implements teardown; T-133 verifies failure recovery; T-138/T-139 integrate commands and CI. The mode variable specified here is not implemented yet. Do not set it expecting the current runner to enforce isolation.

The [T-129 per-run resource lifecycle](e2e-run-lifecycle-contract.md) specifies the E2E naming family, version 2 manifest, ownership markers, teardown phases, interruption handling, preserved reports, and safe recovery. It retains the existing smoke version 1 format as a separate supported implementation and does not implement either the general runner or recovery command.

## Protected targets and permitted writes

The normal browser-development tables are forbidden targets for ordinary E2E runs:

| Role | Protected default table |
| --- | --- |
| Application data, capabilities, and dashboard index | `invite-agent-local-app` |
| Audit history | `invite-agent-local-audit` |

Reject either protected name in either table-name field, even if the other table is disposable. Custom persistent browser-development tables are also shared targets. A name differing from the defaults, a test-looking prefix, an empty table, `APP_ENV=test`, or a local endpoint does not establish ownership.

Ordinary E2E may write only to the exact application/audit pair created exclusively for the current invocation and identified by its validated run manifest and ownership markers. Both roles must belong to the same run and endpoint. A valid manifest from an earlier invocation does not authorize an ordinary new run to reuse its tables. Retries and workers remain within their invocation's owned pair; they must not fall back to shared names. T-129 defines the naming and marker format rather than this document inventing a second scheme. Existing smoke resources use `invite-agent-smoke-app-<runId>` and `invite-agent-smoke-audit-<runId>` with matching run/role/nonce metadata.

The restriction covers every writer: table initialization and dashboard migration, fixture seeding, UI/API requests, negative probes, repository hooks such as capability revocation, and teardown. It applies before the first poll is created. A later check in the revocation checkpoint is insufficient because earlier browser actions have already persisted data.

An isolated run may share a DynamoDB Local service, but it must own its table pair and API/web processes. It must not reuse, reconfigure, stop, or clean up the caller's browser-development stack. An occupied service port must cause a refusal or selection of a separate free port, never silent reuse of a development API. Cleanup may target only the current run's validated owned tables; shared mode never grants automatic shared-table deletion. Detailed lifecycle and recovery rules belong to T-129/T-132.

## Explicit legacy/shared opt-in

The implementation must use `E2E_ALLOW_SHARED_TABLES` as a deliberate local debugging opt-in:

| Effective value | Required behavior |
| --- | --- |
| Unset or exactly `0` | Isolated mode; provision/use the current run's owned pair and refuse shared targets. |
| Exactly `1`, with `CI` unset/empty | Legacy/shared mode, only with explicitly supplied and validated endpoint and both table names. |
| Exactly `1`, with nonempty `CI` | Refuse before startup or test setup. CI must always use isolated mode. |
| Any other value, including empty, `true`, or whitespace | Refuse as invalid configuration; do not interpret general truthiness. |

Shared mode is for a developer deliberately exercising a caller-owned local stack. It must print a conspicuous warning naming the selected endpoint and both tables before allowing tests to proceed, and record the effective mode in diagnostics. Polls and audit events can remain in those tables. It must not provision replacement shared tables, run automatic shared-table teardown, or stop the caller's services. Any subsequent deletion requires the existing separately authorized cleanup workflow.

Both `APP_TABLE_NAME` and `AUDIT_TABLE_NAME` must be explicit in shared mode; missing names must fail rather than become the protected defaults. The API serving the browser must report configuration matching those exact targets before setup can write. The same endpoint, environment, routing, and configuration-consistency checks apply in both modes. Opt-in does not permit remote AWS targets, production configuration, mismatched API/helper targets, malformed manifests, or cleanup of unrelated data.

Opt-in must be supplied in the invoking process's environment for that deliberate invocation. Do not add `1` to `.env.example`, a persistent developer environment file, ordinary npm scripts, the smoke wrapper, or CI. Managed isolated wrappers must refuse `1` rather than silently change their lifecycle or promote a diagnostic run to shared mode. `--headed`, `--ui`, `--debug`, `--force`, and selecting a single spec are not opt-ins. The implementation must not offer an independent flag that bypasses these checks.

## Environment resolution and propagation

Resolve one effective configuration in the parent runner before spawning any writer. Pass that resolved configuration explicitly to the API, Vite, Playwright coordinator/workers, seed/read helpers, repository hooks, and cleanup. Child-process environment changes do not propagate back to the invoking shell: reading port-only process state or asking a developer to repeat overrides is insufficient for a managed run.

| Setting | Required source and propagation |
| --- | --- |
| `E2E_ALLOW_SHARED_TABLES` | Validate once; propagate the effective mode to every E2E child. Unset resolves to isolated mode. |
| `APP_ENV`, `AUTH_MODE` | Isolated children receive `test` and `local`. Reject explicitly supplied `APP_ENV` outside `local`/`test` and `AUTH_MODE` outside `local` before overriding; shared mode requires an explicit local/test environment. |
| `DYNAMODB_ENDPOINT`, `DYNAMODB_PORT` | Resolve one explicit loopback HTTP endpoint and matching port. If both are supplied they must agree; malformed/conflicting values fail. If only a port is supplied, derive the endpoint, using `18000` only when neither is supplied. Validate the resolved endpoint before provisioning. |
| `APP_TABLE_NAME`, `AUDIT_TABLE_NAME` | In isolated mode the manifest's newly generated exact pair is authoritative and replaces inherited names in all children. Shared mode requires both names explicitly. No isolated child may use local-development defaults or independently derive a table name. |
| `API_PORT`, `WEB_PORT` | Explicit wrapper parameters take precedence over shell values, then current defaults (`14000`, `15173`). Validate TCP ports and pass their effective values to services and tests. Isolated services must use available ports and fail if occupied. |
| `PUBLIC_BASE_URL`, Playwright `baseURL`, Vite API proxy | Derive the web origin from effective `WEB_PORT`, and the API origin from effective `API_PORT`. Use those origins consistently; reject unexpected routing to a caller's development API. |
| `AWS_REGION` | Resolve once (current default `eu-west-2`); pass the same region to API, helpers, provisioning, and cleanup. Remove hard-coded helper regions when implementing the contract. |
| `PUBLIC_TOKEN_HASH_KEY` | Resolve once using the local development fallback where appropriate and pass the same value to API and repository hooks. Never include its value in reports or configuration diagnostics. |
| Run identity and manifest reference | Pass the same invocation identity and validated manifest reference to every isolated participant. T-129 specifies their representation; do not rely on organiser IDs as resource ownership. Existing smoke runs use `SMOKE_RUN_MANIFEST_PATH`. |

Neither `.env.example` nor `.env.local` is automatically loaded by the current stack scripts. The future E2E runner must keep sources explicit and deterministic; if environment-file loading is added, it must be resolved by the parent before validation and cannot introduce an implicit shared opt-in.

For DynamoDB, require HTTP with the literal host `127.0.0.1` or `localhost`, an explicit port, no credentials, and no extra path, query, or fragment. Reject HTTPS, remote hosts, IPv6, and malformed ports. Pin `localhost` to loopback; do not follow redirects. Use the explicit endpoint and local dummy credentials in each client so ambient AWS endpoint/credential settings cannot change the target. This contract assumes the selected service is DynamoDB Local, not a tunnel to a remote database.

## Fail-fast gates

Safety checks must be shared by the managed runner and direct Playwright entry point so bypassing npm does not bypass the policy. The required order is:

1. **Before resource or service writes:** validate mode, CI policy, local environment, endpoint, ports, and run identity. In isolated mode generate and validate the owned pair, refusing either protected default, duplicate names, invalid roles, and any existing-table collision. Ignore inherited development table names only by replacing them with the validated generated pair. Never initialize or migrate a shared table while preparing an isolated run.
2. **Before API initialization/migration:** pass the validated exact pair and mode to the E2E API child and revalidate there before table initialization, dashboard maintenance, or request serving. Ordinary `npm run dev` remains a development path; the E2E launch path must not enter its shared-table fallback. After exclusive provisioning, verify both tables' schemas and current run ownership markers. A failure must halt before browser setup, retaining diagnostics and cleaning up only proven owned resources.
3. **Before any test fixture, browser navigation, or API seeding:** the Playwright preflight must validate the effective targets and, in isolated mode, their current run ownership. Verify that the actual API reached through the configured web proxy serves the same run, mode, endpoint, region, and exact table pair. Use a local-only readiness/configuration attestation or equivalent verifiable startup handshake; a `200 /health` or matching port alone cannot establish this. Missing/stale state, absent attestation, or a restarted/mismatched API is a hard failure. The mechanism belongs to T-131 and must not expose credentials or capabilities.
4. **Before helper writes and cleanup:** helpers consume validated configuration rather than `process.env` fallbacks; reject drift from the coordinator/API. Revalidate current ownership before destructive operations. Shared-mode opt-in does not confer owned-table status. Teardown must never use the default development names when manifest loading, provisioning, or startup failed.

Invalid or missing configuration must produce a nonzero result and an actionable error identifying the failing gate and safe target metadata. It must not skip the guard, downgrade to shared mode, retry against development defaults, or report a passing suite. Readiness and ownership checks may perform narrowly scoped reads; validation itself must not repair or migrate the rejected target. Preserve error evidence without logging token-hash keys or public capabilities.

## Required verification scenarios

These are acceptance requirements for T-131/T-133; T-128 does not claim they are implemented or executed. Use controlled doubles and disposable local resources to prove refusals before any writer, never an actual destructive probe against developer data.

| Scenario | Required result |
| --- | --- |
| Ordinary invocation with unset table variables or inherited development names | Managed runner replaces them with a fresh owned pair; direct invocation without a valid isolated run context refuses before test setup. |
| Either protected name in either effective table field, including a mixed shared/disposable pair | Refuse isolated mode before initialization, migration, seed, or browser writes. |
| Custom shared names, prefix lookalikes, another run's valid manifest, or an ownership/schema mismatch | Refuse; names alone are insufficient authorization. |
| Shared opt-in `1`, explicit local endpoint/environment/pair, matching API, no CI | Allow deliberate caller-owned debugging with a warning and retained data; no managed teardown. |
| Shared opt-in with missing names, CI, malformed mode, unsafe endpoint, or production environment | Refuse before startup/setup even when opt-in is present. |
| Valid helper targets but browser proxy points to development API; wrong API pair/region/run/mode | Refuse before the first fixture or UI/API write, even when ordinary health checks pass. |
| Wrapper port overrides, conflicting endpoint/port, child missing config, or API restart | Propagate exact overrides or refuse the conflict/drift; never fall back. Verify API, browser, helpers, and cleanup agree. |
| Direct CLI, headed/UI/debug, discovery/foundation browser stages, smoke, workers, and retries | Enforce the same boundary on every execution path; no command-specific bypass. |
| Startup failure, partial provisioning, browser failure, timeout, or interruption | Preserve evidence and shared data; attempt cleanup only for the proven owned resources under T-129/T-132. |

Verification must capture before/after evidence that shared development tables and a custom caller-owned pair remain unchanged across successful and refused isolated runs. A refused run must show zero initialization/migration, seed, browser mutation, or deletion calls to rejected targets. Demonstrate consistent overridden ports/region/hash configuration without exposing secrets. Command integration and CI migration belong to T-138/T-139; suite/runtime budgets belong to T-130.
