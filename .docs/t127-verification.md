# T-127 dashboard acceptance and regression verification — 5 October 2026

This record covers the implemented local My polls dashboard and its existing poll workflows. [Acceptance traceability](acceptance-use-cases-my-polls.md#story-traceability-and-delivery-boundaries), [requirements](user-requirements-my-polls.md), [architecture](architecture.md#57-my-polls-browser-routes-freshness-and-identity-boundaries) and the [smoke contract](local-smoke-test-contract.md) define the behavior checked here. Historical S-044/T-126 results remain separate.

## Scope and environment

Work ran directly in the shared Windows checkout using Node 24.19.0, PowerShell 7.6.6, installed Playwright Chromium and Docker DynamoDB Local 2.6.1. No `AGENTS.md` existed in the repository or its ancestor directories; repository scripts and documented test/cleanup contracts were followed. T-127 and S-049 were read through the file-based Kanban MCP server; T-125/T-126 were confirmed `done`. All tracker mutations use MCP. The dedicated sub-agent tool was unavailable in this session, so checks and documentation were completed by the main agent without creating a chat.

No commit or deployment is part of this verification. Existing worktracker changes were preserved. Verification uses local simulated organiser identities; Lambda tests supply authorizer context stubs, not an actual Cognito login.

## Commands and results

All commands run from the repository root. Native runner output is retained under `.devstack/`; these ignored local artifacts are diagnostic evidence, not production data or committed deliverables. The initial `npm.cmd run check` could not start because the sandbox denied process access; its shell status was misleadingly zero, and it is not a passing check. The approved repeat executed the complete quality gate.

| Executed command | Result / evidence |
|---|---|
| `& 'C:\nvm4w-monteith\nodejs\npm.cmd' run check` | Exit 0; formatting, lint, typecheck, build, production boundaries, 123 foundation/contract/domain tests (123 passed, no failures/skips; 5.487 s test duration), security. `.devstack/t127-check.log`. |
| `node --test --test-concurrency=1 test/component/*.test.mjs` | Exit 0; 73 passed, no failures/skips/cancellations; 306.044 s. `.devstack/t127-component.log`. |
| `docker ps --format '{{.ID}} {{.Names}} {{.Ports}}'` | Initial sandbox and approved attempts exited 1: Docker Desktop Linux engine pipe absent. After startup, exit 0; no running containers at that point. |
| `docker desktop start` | Exit 0; Docker Desktop started. |
| `docker compose -p invite-a-gent-local up -d dynamodb` | Exit 0; local DynamoDB service started with persisted development data preserved. |
| `pwsh -NoProfile -File .devstack/t127-acceptance.ps1` | Exit 1 because the browser batch found eight Title-selector failures; integration passed. Whole runner 783.00 s; cleanup succeeded. Run `20261005t143529493z-2192e80a9f6e4d38b330c661088f5330`. |

The first full integration run passed all 64 tests (no failures/skips/cancellations; 386.112 s; command 386.14 s). Its complete paginated inventory contained the same 844 baseline tables plus exactly the two manifest-owned acceptance tables, with no retained integration tables. The following full browser run finished with 48 passed / 8 failed, command duration 386.30 s. All eight failures came from older non-exact `getByLabel("Title")` selectors matching both the editor and dashboard search. These are test-selector failures, not failed server/domain assertions. The original output and diagnostics remain in the run directory; final focused correction verification is recorded below. The runner compiled the initial test sources before the selector edits, so that in-flight batch retained the original selectors.

Constituent commands for that run:

```powershell
node .devstack/t127-table-inventory.mjs
node scripts/smoke-run-resources.mjs init <manifest-path> <run-id> http://127.0.0.1:18000
./scripts/Start-DevStack.ps1 -SmokeRunManifestPath <manifest-path> -SkipBuild
node --test --test-concurrency=1 test/integration/*.test.mjs
node .devstack/t127-table-inventory.mjs
node node_modules/@playwright/test/cli.js test --grep-invert 'deterministic local smoke journey|intentional failure retains' --project=chromium --workers=1 --retries=0
./scripts/Stop-DevStack.ps1
node .devstack/t127-table-inventory.mjs
```

Initialization, provisioning/startup and stop/owned cleanup succeeded. The three inventory reads succeeded and the comparisons passed. Exact manifest/run arguments are recorded in `startup.log`, `shutdown.log`, `manifest.json` and `acceptance-summary.json` under `.devstack/smoke-runs/20261005t143529493z-2192e80a9f6e4d38b330c661088f5330/`. `tables-before.json`, `tables-after-integration.json` and `tables-after.json` retain complete, paginated names, not sampled prefixes. The browser batch excluded the separately executed smoke journey and the opt-in intentionally failing diagnostic spec; it skipped no application acceptance test.

## Changes made during verification

`test/e2e/date-choices.spec.ts`, `design-fidelity.spec.ts`, `draft-details.spec.ts`, `draft-preview.spec.ts` and `public-poll.spec.ts` now use `getByRole("textbox", { name: "Title", exact: true })` for the editor field, matching the already passing dashboard/lifecycle/smoke tests. Existing creation/date/location/publication/preview/focus assertions are retained. No production source or application behavior changed. README now distinguishes the actual local TypeScript DOM/Vite frontend from the planned React/AWS topology. This record and linked requirements, acceptance, architecture, cleanup and smoke guidance distinguish current executions from historical evidence and from production readiness.

An intermediate correction used exact label text. Its focused rerun exposed that label matching includes the visible required `*`, while the textbox's accessible name excludes that `aria-hidden` marker. The exact-label correction therefore timed out and was replaced with the exact role/name selector above. That failed correction run is retained as `20261005t144904953z-457a12a154fd456abbc1cc9a1ef2e9fa`; it is not passing evidence. Final role-selector rerun results are recorded below.

Both focused reruns used this command, with the first running the intermediate selectors and the second the final role selectors:

```powershell
& './.devstack/t127-acceptance.ps1' -BrowserOnly -Specs @(
  'test/e2e/date-choices.spec.ts',
  'test/e2e/design-fidelity.spec.ts',
  'test/e2e/draft-details.spec.ts',
  'test/e2e/draft-preview.spec.ts',
  'test/e2e/public-poll.spec.ts'
)
```

| Focused run | Result | Command / whole runner seconds | Cleanup |
|---|---|---|---|
| `20261005t144904953z-457a12a154fd456abbc1cc9a1ef2e9fa` | Exit 1; 5 passed / 8 timed-out exact-label tests. No application failure. | 253.68 / 258.58 | Both tables deleted, two seeded polls removed, baseline inventory restored, no cleanup/diagnostic errors. |
| `20261005t145348671z-40f985755ffe4b73a12f44949cac983b` | Exit 0; all 13 passed (Playwright 6.9 s), no failures/skips. Final role selectors. | 7.29 / 10.18 | Both tables deleted, eight fixture polls removed, baseline inventory restored, no cleanup/diagnostic errors. |

Each expanded Playwright command is recorded in its `acceptance-summary.json` and `playwright.log`; both run the five specs above with `--grep-invert 'deterministic local smoke journey|intentional failure retains' --project=chromium --workers=1 --retries=0`. Initialization/startup/stop and before/after inventory commands are the same as the original run, omitting the already-passing integration stage. Final passing coverage is all 56 distinct selected browser cases across the original 48 successes plus this 13-case rerun (five overlap). This is not presented as a single green full-suite invocation. No unresolved browser failure remains; smoke is recorded separately below.

After the selector edits, `node scripts/check-format.mjs`, `node scripts/lint.mjs`, `node node_modules/typescript/bin/tsc -b --pretty false` and `git diff --check -- . ':(exclude).worktracker'` passed. Git emitted only line-ending warnings. The first documentation-link helper incorrectly treated an inline unsafe-URL example as a file link; after excluding code examples and URI schemes, `node .devstack/t127-doc-links.mjs` passed 142 relative file/heading links, excluding two Kanban links from filesystem reads. Final checks are recorded below.

The same direct format/lint/build commands also passed after replacing the intermediate exact-label selectors with the final role/name selectors.

The quality gate expands to `node scripts/check-format.mjs`, `node scripts/lint.mjs`, `tsc -b --pretty false --noEmit false`, `tsc -b --pretty false`, `node scripts/check-production-boundaries.mjs`, `node --test test/foundation/*.test.mjs` and `node scripts/check-security.mjs`; each succeeded. It includes actual wrapper/resource fault contracts as well as dashboard cursor/query/contracts/persistence/lifecycle tests, ranking, draft/publication, dates, location and undo.

## Isolated smoke executions

| Command | Run under `.devstack/smoke-runs/` | Result |
|---|---|---|
| `pwsh -NoProfile -File scripts/Run-SmokeTests.ps1` | `20261005t145503072z-ad74f043e25e43bab57d9f1a6339b595` | Exit 0 / browser exit 0; 1 passed, all 11 checkpoints; browser 28.5 s / wrapper 31.4 s. Ports Web/API/DynamoDB = 15173/14000/18000. |
| `pwsh -NoProfile -File scripts/Run-SmokeTests.ps1 -WebPort 15174 -ApiPort 14001 -DynamoDbPort 18000` | `20261005t145622990z-995af3677c164d298343427a02be1d98` | Exit 0 / browser exit 0; 1 passed, all 11 checkpoints; browser 29.1 s / wrapper 32.3 s. Web/API ports overridden; DynamoDB stayed at 18000. |

Both were successive invocations on the same persisted database, each restarting its API/Vite stack with fresh run/poll/table/browser identities. Each wrapper ran the normal TypeScript build, manifest initialization/provisioning and `node node_modules/@playwright/test/cli.js test test/e2e/smoke.spec.ts --project=chromium --workers=1 --retries=0`, then normal stop/owned-table cleanup. Both summaries report `cleanupFailure: null`, `diagnosticFailures: []`, `recordedStackStopped: true` and two deleted tables. The preserved `test-results/**/smoke-summary.json` reports `result: passed`, all SM-01–SM-11 steps and no errors. Each manifest records its single poll. No deliberately altered smoke assertion was introduced for T-127; real failed acceptance runs and integration failure children provide this run's failure-cleanup evidence.

## Final resource and documentation checks

`node .devstack/t127-verify-resources.mjs` exited 0 while DynamoDB remained reachable. It validated all five exact run manifests, checked every one of their ten tables with `DescribeTable` returning `ResourceNotFoundException`, checked both smoke checkpoint summaries, and compared a complete paginated `ListTables` inventory against the original baseline: exactly 844 names before and after. Result: `.devstack/t127-final-resources.json`. Across these five table pairs, 704 recorded acceptance/smoke polls were removed; integration fixtures independently removed their own tables. Historical tables and shared development data were not selected for deletion.

The final PowerShell process/port inspection passed: no `.devstack/processes.json`, no listeners on 14000/15173/14001/15174, original API/Vite PIDs absent, and all PID/start-time pairs recorded by both focused runs stopped. `docker ps --format '{{.ID}} {{.Names}} {{.Ports}}'` identified only the local DynamoDB test service started for this verification. `docker compose -p invite-a-gent-local down` stopped that service after the absence/inventory proof, preserving `.dynamodb/` and all baseline data. Docker Desktop itself was left running.

Final direct formatting, lint and TypeScript build checks passed after the role-selector correction. `node .devstack/t127-doc-links.mjs` passed 142 relative file/heading links (two Kanban links excluded), and `git diff --check -- . ':(exclude).worktracker'` exited 0 before handoff. Git emitted line-ending and inaccessible global-ignore warnings; these did not fail the checks. No broadened rerun of the already-passing foundation/component/integration/dashboard suites was needed for selector-only and documentation edits.

## Changed files and review scope

- `README.md`: current local frontend versus production target, T-127 evidence link and isolated acceptance data lifetime.
- `.docs/t127-verification.md`: this command/result, acceptance, cleanup, failure and readiness record.
- `.docs/acceptance-use-cases-my-polls.md`, `.docs/user-requirements-my-polls.md`, `.docs/architecture.md`: link current measured execution separately from historical delivery and production targets.
- `.docs/local-smoke-test-contract.md`, `.docs/local-cleanup-operations.md`: current verification/cleanup evidence links without changing ownership/deletion contracts.
- `test/e2e/date-choices.spec.ts`, `test/e2e/design-fidelity.spec.ts`, `test/e2e/draft-details.spec.ts`, `test/e2e/draft-preview.spec.ts`, `test/e2e/public-poll.spec.ts`: exact accessible textbox selector for the editor Title field; no weakened assertions or production changes.
- Ignored `.devstack/t127-acceptance.ps1`, `t127-table-inventory.mjs`, `t127-doc-links.mjs`, `t127-verify-resources.mjs` and run/log artifacts: local evidence capture/verification, left available for review; not automatically included in Git commits.

Kanban completion: `set_status(projectId="wt_be50951b", id="T-127", status="done")` returned effective status `done`; a fresh MCP entity read confirmed it. Final MCP `validate` returned no errors or warnings. Its `changedFiles` were:

- `.worktracker/entities/T-127-run-dashboard-acceptance-and-regression-checks-and-record-implementation-evidence.md`
- `.worktracker/graphs/dependencies.mmd`, `.worktracker/graphs/E-008.mmd`, `.worktracker/graphs/E-012.mmd`
- `.worktracker/index/BLOCKED.md`, `.worktracker/index/E-008.md`, `.worktracker/index/E-012.md`, `.worktracker/index/INDEX.md`, `.worktracker/index/READY.md`

These entity/generated board files were updated only through MCP and remain uncommitted with the implementation evidence. No commit, deployment, staging or retained-data reset was performed.

## MP-US-01–11 evidence

| Story / decision | Executed coverage and what it establishes |
|---|---|
| MP-US-01 landing | Query/contract defaults; organiser-navigation components/browser; Active entry, visible Create poll, private owned-list reads. Loading components hold replies and distinguish pending, failure/retry and exhausted empty results. |
| MP-US-02 ownership | API/repository matrices for two owners, missing/invalid identity, forged-owner inputs, foreign continuations, non-owner detail denial; cursor binding and stale-index metadata rechecks. Navigation guards and browser discovery compare returned IDs, not just titles. |
| MP-US-03 summaries | Desktop table/mobile cards expose all five fields; date-only/calendar preservation, saved timed offsets/years, DST folds, viewer time zones, incomplete drafts and zero/current participant counts. Component layouts include 320px and intermediate widths. |
| MP-US-04 creation order | Immutable original creation instant/index key through edits, publication, collaboration, close/reopen/undo; descending ID tie-break; complete accumulated pages without duplicates/omissions. Older poll changes do not promote it above newer peers. |
| MP-US-05 filters | Explicit Active = Draft + Open and separate Draft/Open/Closed answers at all test layers. Filter changes preserve title search, discard old pages and start page one; accessible keyboard controls on both viewports. |
| MP-US-06 search / pagination | Independent explicit NFC/case/Unicode-whitespace/substring answers; significant accents/punctuation and excluded non-title/foreign fields. Live sparse queries cross the 200-candidate budget, then 25 + 1 results. Empty continuations differ from exhausted no-match; retry preserves loaded entries and the same continuation. |
| MP-US-07 creation | Create from Active/Closed and save/edit through the existing UI, then return to default Active and blank search with saved dates/counts. Creation and edit revisions remain auditable. |
| MP-US-08 title / return | Draft editor and Open/Closed management destinations; visible return links. Page-two return retains filter/search, discards accumulated pages and refetches current page one. Direct route/identity boundaries remain enforced. |
| MP-US-09 publication | UI publication remains on management with its newly issued share link; return changes Draft/Open/Active membership without changing original creation time. |
| MP-US-10 lifecycle / refresh | Cancelled confirmations are read-only; confirmed atomic close/frozen ranking and reopen/provisional selection retain data/history and refresh list membership/counts. Component restoration dispatches persisted `pageshow` and rejects old pending replies; native browser-cache restoration remains unverified. |
| MP-US-11 public isolation | Independent unauthenticated contexts open capabilities directly in Open/Closed/reopened states; no dashboard/owner controls or private summary disclosure. No-auth/capability-only organiser list and lifecycle requests are denied; closed public writes remain rejected. |

The exact files for each story are linked in the acceptance matrix. Intercepted component tests render the real frontend but substitute transport. Local browser tests run against the actual HTTP API and DynamoDB. Read-only discovery/navigation compares complete paginated app/audit snapshots; lifecycle changes assert existing contiguous audit revisions and original creation keys.

## Isolation and failure cleanup

The local acceptance runner is retained at `.devstack/t127-acceptance.ps1`, with a paginated table inventory helper at `.devstack/t127-table-inventory.mjs`. It uses existing `smoke-run-resources.mjs` manifest initialization and `Start-DevStack.ps1 -SmokeRunManifestPath ... -SkipBuild`, propagating the exact owned table names/endpoint/ports to the runners. It captures reports before stopping only its manifest-matched stack in `finally`, then verifies table-name inventory against baseline. It does not use broad cleanup, reset `.dynamodb/`, or select historical tables by prefix.

Integration fixtures create UUID table pairs and register cleanup before composition/provisioning. `integration-cleanup.test.mjs` deliberately fails child setup/assertion/dashboard/cleanup paths and checks real table absence while preserving the original error. `my-polls-fixture.test.mjs` proves independent pairs. Controlled foundation resource/wrapper faults check collisions, marker refusal, partial provisioning, teardown failure, recovery, foreign stack preservation and repeated identities; these controlled tests are distinct from real browser failures.

Ordinary direct Playwright retains its polls. This acceptance run instead puts all browser fixtures in the owned pair; shutdown discovers every poll inside that app table before deleting both tables and GSI1. Complete before/after inventories verify no new integration or acceptance tables remain; they do not prove byte-for-byte preservation of every historical record. Sentinel/snapshot tests establish scoped preservation for their explicit records.

The initial real browser failure batch deleted both tables with `cleanupFailure: null`, discovered/recorded all 692 browser-created polls, and restored the complete original 844-name inventory. Both original API/Vite PIDs (25352 and 20044) were absent after shutdown. It saved the eight failing tests' screenshots, videos, traces, error contexts, API/service logs and HTML report before teardown. This is real failure cleanup evidence; it is not inferred from the controlled wrapper tests. No old tables or retained developer polls were deleted.

## Production-readiness limits

- Local `x-local-organiser-id` is a guarded simulation. Stubbed Lambda JWT subjects establish adapter contracts, not token verification, Cognito sign-in, deployed authorizers or production ownership end to end.
- Production still needs handler composition/package, browser authentication, protected routes/authorizers, raw-query forwarding, index/count migration, GSI1 and metadata IAM, stable protected cursor secret, cache configuration and live AWS smoke. No AWS deployment, production migration, IAM synthesis or sign-in was performed.
- GSI propagation is eventually consistent; strongly rechecking candidate metadata does not make a newly indexed poll immediately visible. Pagination reads a live list, not a snapshot. Dashboard refresh happens on return/reload/restoration, without timer/focus/visibility polling.
- Native Back/Forward cache restoration has component-event coverage only. Random default local cursor secrets invalidate continuations on API restart; expiry/rotation also require a fresh page-one query.
- A later dashboard-owned detail visit does not recover the public share capability, and poll-ID management responses are read-only. Publication retains the issued link in its current document.
- Smoke link revocation uses the isolated repository hook; organiser regeneration has no supported route/UI. Structured history value cells still show `Changed values`; action summaries and owner API verify exact availability changes.
- Abrupt termination or an unavailable database can prevent teardown; manifests/diagnostics support recovery but are not backups. Local runs and desktop/mobile viewport emulation do not establish all deployed browsers/devices or production load characteristics.
