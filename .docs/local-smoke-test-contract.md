# Local smoke-test contract

## Purpose and delivery status

S-040 documents the existing S-037–S-039 disposable-table and scoped-cleanup implementation in the [README lifecycle/commands](../README.md#local-smoke-test) and [cleanup operations, acceptance traceability, and verification](local-cleanup-operations.md). The guide distinguishes confirmed poll/run-record deletion from immediate whole-table teardown, retained historical data, and failure recovery.

Epic E-010 / Story S-034 defines a repeatable local smoke journey across the application's critical facets. This contract completes T-071 (coverage), T-072 (scripted data and isolation), and T-073 (assertions, diagnostics, commands, and regression boundaries).

S-035 provides the executable browser journey in `test/e2e/smoke.spec.ts`, with scripted UI inputs and isolated fixtures. S-036 adds `npm run test:smoke`, which manages startup, execution, evidence collection, and shutdown using the existing local scripts. There is no separate seed script. A passing smoke run demonstrates the checkpoints below, subject to the implementation limitations recorded at the end, not all acceptance scenarios.

Authoritative behaviour: [user requirements](user-requirements.md) and [acceptance use cases](acceptance-use-cases.md). Local installation, ports, startup, shutdown, and troubleshooting remain in the [README](../README.md). Local authentication is a test adapter; this journey cannot verify Cognito or deployed AWS services.

## Checkpoints and acceptance traceability

Run one ordered journey on a fresh poll, using an owning organiser and two independent unauthenticated browser contexts. Each checkpoint needs an explicit result in the report. References below identify selected scenarios within a use case; they do not imply complete coverage of every example in that story.

| Checkpoint | Action and required observable result | Acceptance coverage | Existing implementation evidence |
| --- | --- | --- | --- |
| SM-01: Local readiness | Verify the web response, API `/health`, and successful poll persistence through the API into DynamoDB Local. Reload saved draft details to establish persistence. | UC-01 / US-01; local architecture | `test/integration/local-services.test.mjs`, `test/e2e/shell.spec.ts`, `draft-details.spec.ts` |
| SM-02: Draft preparation | Create and save details through the UI. With only A present, attempt publication: draft stays private with no issued link. Add B and C; exercise draft date editing, reordering, and removal using temporary D, then restore final A/B/C order. Save, reload, and preview: details and zoned dates match, responses cannot be entered, state remains Draft. | UC-01 / US-01, US-02, US-04, US-05; UC-02 / US-07 | `draft-details.spec.ts`, `date-choices.spec.ts`, `draft-preview.spec.ts`; `test/integration/publication.test.mjs` |
| SM-03: Publish and share | Publish through the UI, copy the exposed link, assert its 32-character Base64URL token shape and Open state. Open that exact link in fresh public contexts without organiser parameters or headers. Details and all dates render without account prompts; organiser controls and private fields are absent. | UC-02 / US-06; UC-03 / US-08; UC-09 / US-35 | `public-poll.spec.ts` |
| SM-04: Shared availability | Public context 1 adds Alice, Bob, and Charlie through the UI. Each new row defaults to No. Apply the matrix below using mouse and at least one keyboard toggle; context 2 edits a row it did not create. Rename Bob to Robert and back without changing answers. Remove Charlie with name confirmation and restore him with the specified answers. Both views converge on the same values, totals, and ranking. | UC-03 / US-09, US-12–US-15; UC-04 / US-17–US-19 | `collaborative-availability.spec.ts`, `live-ranking.spec.ts` |
| SM-05: Rejected shared write | Submit duplicate `alice` after Alice exists. Assert the visible validation message, server `409 / CONFLICT`, unchanged participant data, totals, ranking, version, and audit count. | UC-03 / US-11 | `collaborative-availability.spec.ts`, `test/integration/collaborative-availability.test.mjs` |
| SM-06: Location maintenance | Render safe initial Markdown and its HTTPS target. Change location while Open; public views update and lifecycle stays Open. Attempt one unsafe value; server rejects it and entered text remains correctable without replacing saved content. Later, clear location while Closed: it remains Closed, selection and frozen ranking stay unchanged, and location disappears after reload. | UC-09 / US-35–US-37 (selected examples) | `location-maintenance.spec.ts`, `draft-details.spec.ts` |
| SM-07: History and isolated undo | Owner views history newest first, with action, revision, before/after values, time, and actor. Toggle Alice's A from Yes to No, then undo that specific revision through the UI. A and the baseline ranking return; original revision remains unchanged and one undo revision is appended. | UC-05 / US-20, US-21; UC-04 / US-19 | `audit-history.spec.ts`, `undo.spec.ts` |
| SM-08: Server authorization | Anonymous requests for the draft and history, and an undo request using only public access, fail `401 / UNAUTHENTICATED`. A different local organiser's location update fails `403 / FORBIDDEN`. Capture owner snapshots to prove no mutation or history disclosure. Public controls alone are insufficient evidence. | UC-02 / US-07; UC-05 / US-23; UC-08 / US-31, US-32; UC-09 / US-38 | `test/integration/organiser-authorization.test.mjs`, `audit-authorization.test.mjs`, `location-maintenance.test.mjs` |
| SM-09: Close and freeze | Select A, inspect Yes/No attendance and closure warning, cancel and prove no change, then confirm closure. A is prominent even though B ranks first; Final ranking stays B/A/C. Reload a public view. Direct public availability and owner date-edit writes fail `422 / INVALID_LIFECYCLE`; participant/date controls are unavailable and frozen state is unchanged. | UC-06 / US-24–US-27 (representative rejected writes) | `closing.spec.ts`, `closed-state.spec.ts`; `test/integration/closed-state.test.mjs` |
| SM-10: Reopen and close again | Cancel reopening and prove no change. Confirm: state becomes Open, A is provisional, participant editing and live ranking return. Change Alice's C from No to Yes; totals become 2/3/2 and order B/A/C. Select C and confirm closure; C becomes final, responses freeze, previous close and reopen revisions persist. | UC-07 / US-28–US-30 (different-date scenario) | `reopening.spec.ts` |
| SM-11: Public-link revocation | Exercise the server's revoked-link boundary as described under the coverage gap below. Old-link read and representative write return `410 / LINK_REVOKED`, without changing responses or audit history. Public UI renders a non-sensitive invalid-link state. | UC-08 / US-34, partial; US-33 remains a gap | `test/integration/publication.test.mjs` (repository revocation and read rejection only); `public-poll.spec.ts` (unknown-link UI only) |

E2E filenames in the evidence column are relative to `test/e2e/` unless a full path is given. These are the original reuse/reference points. The combined executable evidence for every row is the matching named step in `test/e2e/smoke.spec.ts` and its `smoke-summary.json` attachment; S-036 verification results are recorded below. Acceptance references describe selected examples, including the explicitly partial SM-11 coverage.

## Deterministic scripted initial data

Scripted data means fixed inputs applied by browser actions, with generated identities captured from server responses. Do not prepopulate poll or participant records in DynamoDB: the creation and participation steps are part of the smoke test. Authentication prerequisites and the explicitly isolated revocation hook are the only setup exceptions. Do not publish or close the poll in an API helper before testing those UI transitions.

| Field | Input |
| --- | --- |
| Logical organiser | Olivia; acceptance persona `olivia@example.test`, represented locally by `local-organiser-<runId>` rather than an email login |
| Other organiser | `local-organiser-<runId>-other` |
| Initial title | `Autumn get-together [smoke <runId>]` |
| Edited title | `Autumn planning session [smoke <runId>]` |
| Description | `Choose every date you could attend.` |
| Instructions | `Please respond by Friday.` |
| Initial location | `**Community Hall** — [map](https://example.test/map)` |
| Open-state location | `**Riverside Room** — [map](https://example.test/map)` |
| Unsafe location probe | `[bad](javascript:alert(1))` |
| Time zone | `Europe/London` |
| Participants | `Alice`, `Bob`, `Charlie`; temporary rename `Robert`; duplicate probe `alice` |

The map URL is a rendering fixture. Assert the link target without navigating to it or depending on an external service.

| Alias, final original order | Choice payload | Expected local display meaning |
| --- | --- | --- |
| A | `{ "kind": "date", "localDate": "2026-10-10" }` | Saturday 10 October 2026; no invented time |
| B | `{ "kind": "date-time", "localDateTime": "2026-10-17T18:00" }` | Saturday 17 October 2026 at 18:00 in Europe/London |
| C | `{ "kind": "date-time", "localDateTime": "2026-10-24T18:00" }` | Saturday 24 October 2026 at 18:00 in Europe/London |
| D, temporary only | `{ "kind": "date", "localDate": "2026-10-31" }` | Removed before publication |

These fixtures deliberately mix date-only and timed options and align with the acceptance baseline. Keep dates fixed; the current application permits these values without requiring them to be future dates. If that policy changes, update the fixture contract explicitly instead of silently deriving dates from the wall clock. Assert poll-zone semantics, not the host's time zone or locale-specific punctuation.

Draft date recipe: create A; prove one-date publication fails; add B, C, and D; edit D to `2026-11-01`, move it upward, then remove D. Save and verify final order A/B/C. Edit the title to its final value and verify reload persistence before publication.

Apply this matrix after default-No row creation:

| Participant | A | B | C |
| --- | --- | --- | --- |
| Alice | Yes | Yes | No |
| Bob | Yes | Yes | No |
| Charlie | No | Yes | Yes |
| Yes total | 2 | 3 | 1 |

Assertions at intermediate checkpoints:

- With no responses, totals are 0/0/0 and ranking is A/B/C (ties retain original order); all three entries are shown.
- After the baseline matrix, ranking is B/A/C with totals 3/2/1 in ranking order. Table totals stay in original A/B/C order.
- Bob-to-Robert-to-Bob renames preserve the matrix and ranking.
- Removing Charlie gives totals 2/2/0 and ranking A/B/C, proving original-order tie breaking. Re-adding Charlie first gives all No; setting B and C to Yes restores 2/3/1 and B/A/C.
- Alice A Yes-to-No gives 1/3/1 and B/A/C. Undo restores 2/3/1. Capture the exact target revision; do not select an arbitrary latest event after other actions.
- A closure attendance: Yes Alice and Bob; No Charlie. Closed ranking is B/A/C despite selecting A.
- After reopening, Alice C No-to-Yes gives 2/3/2 and B/A/C; second closure selects C. This accepted toggle has its own audit revision and proves editing was restored with an actual changed answer.

## Isolation, repeatability, and data lifetime

- Generate a new lowercase alphanumeric/hyphen `runId` for every invocation and retry, including a random invocation component, project, worker, and retry number. Apply frontend normalization consistently when deriving owner headers. The existing fixture's project/worker/retry/title identifier alone is not unique across repeated invocations.
- Navigate the owner to `/?testRunId=<runId>` and retain that identity for draft/history navigation and organiser public views (`organiser=1`). Public contexts must use the plain issued URL and no `x-local-organiser-id` header; do not inherit an authenticated request context for negative authorization checks.
- Capture poll, date, participant, and revision IDs from responses. Map A/B/C by payload and saved order; do not guess IDs or locate an old poll by title. Restored Charlie receives a new participant ID.
- Begin each attempt with empty browser storage and a newly created Draft with no participants or public capability. Never depend on prior specs, a previous run, or pre-existing `.dynamodb/` content. A retry replays the complete journey on new data.
- Run with one worker initially. Coordinate the two public contexts sequentially, waiting for accepted responses and observer convergence before the next action. No sleeps as correctness checks and no deliberate update races in this smoke journey.
- Keep existing local data intact. S-037 gives wrapper runs disposable tables with the normal schemas, validated loopback configuration, exclusive creation, and matching ownership metadata. Shared tables and previously retained polls are preserved; no shared-table scan/delete or `.dynamodb/` reset is performed.
- Close all browser/request contexts after success or failure. Preserve failure artifacts before stopping services. The wrapper records every created poll ID in `manifest.json`, then deletes its owned tables after API/web shutdown and before stopping DynamoDB. Direct Playwright invocation retains its poll in the existing stack.
- Verification requires two successive runs against the same persisted local database, a run after stop/start, and a run with overridden ports. Every managed run restarts the caller-owned stack; measured S-036 results are recorded below.

## Assertions and diagnostics

Use accessible roles, labels, and semantic messages. UI actions must prove persisted state through reload or API reads where appropriate. Read assertions may use API helpers; writes under test must pass through the intended UI except direct negative probes and the documented revocation hook.

For each accepted mutation, snapshot owner history beforehand and assert exactly one added revision per accepted application write, matching action, affected entity, before/after, and actor. A date/details save may group multiple field edits into one write: count requests, not keystrokes. Closing selects the date and changes state in one atomic revision; reopening creates a separate revision. Read all history pages if necessary and verify newest-first ordering and unchanged prior entries. Do not assert fixed revision totals, UUIDs, or exact timestamps; assert generated identity consistency and timestamps within the operation window.

For a rejected request or cancelled dialog, compare authoritative state, version, participants, proposed dates, totals, ranking, final selection, location, and history before/after. Expect no new audit revision. Issue otherwise-valid payloads so the intended authorization/lifecycle check is tested. Stable error expectations come from `test/fixtures/contracts.mjs` and shared contracts:

| Probe | Expected server result |
| --- | --- |
| Incomplete publication; unsafe location | `400 / VALIDATION_ERROR` |
| Missing organiser identity; public capability alone on owner route | `401 / UNAUTHENTICATED` |
| Different organiser performing owner operation | `403 / FORBIDDEN` |
| Unknown public token | `404 / NOT_FOUND` |
| Duplicate participant name | `409 / CONFLICT` |
| Revoked public token, read or write | `410 / LINK_REVOKED` |
| Closed-poll response/date modification | `422 / INVALID_LIFECYCLE` |

Public JSON and history must omit organiser credentials and raw tokens; public JSON must omit organiser identity, token hash, and audit data. Supported Markdown renders the expected strong text and HTTPS target with safe link attributes, with no executable elements or handlers.

Use named Playwright steps SM-01 through SM-11. Report the failed checkpoint, run ID, poll ID, browser role, last completed action, expected versus actual state, and HTTP status/error code. Distinguish startup readiness failure from a product assertion failure; both produce a nonzero execution result.

Reuse `test/e2e/fixtures.ts` diagnostics and `playwright.config.ts` retention settings. Extend coverage when implementing to include all manually created pages and API request contexts: the current fixture listens only to its injected `page`. On failure retain:

- Trace, screenshot, and video for the failing browser context, plus relevant observer state.
- Redacted API method/path/status/error-code logs, including API-only probes; no raw capability URLs, auth headers, or secrets in textual summaries.
- `.devstack/service-logs/api.out.log`, `api.error.log`, `vite.out.log`, and `vite.error.log`, copied/attached before stack shutdown.
- A compact checkpoint summary and sanitized state differences; missing logs must not mask the original assertion failure.

Current outputs are `test-results/` and `playwright-report/`; inspect with `npx playwright show-report`. Traces, screenshots, and videos can contain local public URLs, so retain them locally and sanitize before sharing. Existing API URL redaction is a useful starting point, not complete artifact sanitization.

## Developer command and outcomes

Install README's Node/npm, PowerShell, Docker, dependencies, and Chromium prerequisites, then run from the repository root with the recorded dev stack stopped:

```sh
npm run test:smoke
```

`scripts/Run-SmokeTests.ps1` builds/starts via `Start-DevStack.ps1`, runs `node node_modules/@playwright/test/cli.js test test/e2e/smoke.spec.ts --project=chromium --workers=1 --retries=0`, preserves diagnostics, and calls `Stop-DevStack.ps1` in `finally` when recorded state remains. Success is `1 passed`, eleven completed checkpoint names in the smoke attachment, exit 0, owned tables deleted, and no remaining recorded stack state. Startup/test/cleanup failures return nonzero; browser failures preserve the Playwright exit code. A pre-existing state file is rejected before cleanup, preserving that stack. Reused DynamoDB is left running under the existing ownership rules. S-037 deletes only disposable run tables; shared database contents are preserved.

The original contract allowed an already-running-stack command with an optional wrapper. S-036's requested integrated startup/shutdown makes the wrapper the default command. The direct invocation for an already-running stack remains `npx playwright test test/e2e/smoke.spec.ts --project=chromium --workers=1 --retries=0`; it leaves that stack running and requires matching startup configuration in its shell. Other npm commands and the general Playwright configuration are unchanged.

`WEB_PORT`, `API_PORT`, and `DYNAMODB_PORT` are resolved by the existing start script and shared with Playwright in the same PowerShell process. Explicit `-WebPort`, `-ApiPort`, and `-DynamoDbPort` parameters take precedence over environment variables. Startup derives `PUBLIC_BASE_URL` and loopback `DYNAMODB_ENDPOINT` from these effective ports. Table names, region, and token-hash key are inherited consistently by the API and repository-only revocation helper. `.env.local` is not loaded. `-ReadinessTimeoutSeconds` changes the 90-second startup deadline. Example:

```powershell
npm run test:smoke -- -WebPort 15174 -ApiPort 14001 -DynamoDbPort 18001
```

Alternatively set all three port environment variables before the command as shown in README. Additional Playwright switches are not accepted by the wrapper. One worker and zero retries apply even under CI; the journey has a 180-second ceiling and 15-second action/navigation limits. An absent checkpoint is a coverage gap, never a passing result.

Each invocation prints `.devstack/smoke-runs/<runId>/`. Its `summary.json` records startup versus smoke phase, timestamps/duration, effective ports after readiness, test and final exit codes, cleanup/diagnostic errors, and recorded-state cleanup. `startup.log`, `playwright.log` (when tests execute), `shutdown.log` (when wrapper cleanup executes), service logs, `test-results/`, and `playwright-report/` are preserved before shutdown. Startup failures do not archive stale browser reports; service logs can be stale if startup fails before launching services. A failed diagnostic copy is reported without replacing the original failure. The fixture's `smoke-summary.json` attachment contains the run/poll identities and completed checkpoints; failed runs add redacted API logs, authoritative state, role screenshots/videos, and traces.

Top-level Playwright reports represent only the latest test run. View preserved reports with `npx playwright show-report .devstack/smoke-runs/<runId>/playwright-report`. Keep artifacts local and sanitize before sharing: media, traces, and raw runner/Playwright output can include capability URLs. Startup failure has no application checkpoint result; use the runner summary and service logs. After correcting the failure, rerun the same command with fresh browser/organiser/poll state and retained database contents.

## Coverage gap: public-link regeneration

Inspection found `DynamoDbPollRepository.revokePublicToken` and revoked-capability enforcement, but no organiser regeneration route or UI. The existing publication integration test revokes through the repository and checks GET rejection; it does not prove token rotation or rejected stale writes. US-33 therefore cannot currently be exercised as a complete user journey.

For S-035, SM-11 may use a clearly labelled local/test-only setup helper to revoke only this attempt's capability after SM-10, then check old-link GET and participant write rejection through HTTP plus the browser invalid-link state. It must reuse the running stack's configuration, obtain only this poll's token hash, create no new production route, and preserve the frozen poll and audit. That covers revoked access enforcement, not organiser regeneration or a regeneration audit event. If no appropriate isolated helper is available, report SM-11 explicitly as blocked coverage; do not silently skip it or manufacture a passing rotation result.

Full US-33 coverage requires separately scoped application work: owner regenerates while Open, a different valid token is issued, the old token cannot read or write, the new token exposes the same poll and allows responses, and the rotation revision exposes neither token. This story identifies the gap without implementing that feature.

## Boundaries versus the regression suite

The smoke contract samples every critical facet through one lifecycle. The broader suite remains authoritative for exhaustive examples and edge conditions:

| Area retained in broader tests | Existing location |
| --- | --- |
| Invalid/duplicate dates, DST gaps/folds, alternate offsets, exhaustive reorder behaviour | `test/e2e/date-choices.spec.ts`, `test/foundation/date-choices.test.mjs` |
| Name normalization/Unicode limits, every invalid response value, deletion mismatch, concurrent last-update-wins | `test/foundation/participant-name.test.mjs`, `test/integration/collaborative-availability.test.mjs`, `test/e2e/collaborative-availability.spec.ts` |
| Six-plus dates/top-five cap, complete ranking mutation matrices | `test/foundation/ranking.test.mjs`, `test/e2e/live-ranking.spec.ts` |
| History pagination, overwrite-warning undo, invalid structural undo, complete undo variants | `test/integration/audit-history.test.mjs`, `test/integration/undo.test.mjs`, `test/e2e/undo.spec.ts` |
| Every forbidden route/actor/state combination and malformed-token case, concurrent publication, hash-only storage | `test/integration/organiser-authorization.test.mjs`, `audit-authorization.test.mjs`, `publication.test.mjs`, `test/foundation/publication-security.test.mjs` |
| All closed write types, same-date reclosure, full cancellation and keyboard/focus variations | `test/integration/closed-state.test.mjs`, `test/e2e/closed-state.spec.ts`, `reopening.spec.ts` |
| All location limits, Markdown constructs and unsafe payloads, set/edit/clear across every state | `test/foundation/location-markdown.test.mjs`, `test/integration/location-maintenance.test.mjs`, `test/e2e/location-maintenance.spec.ts` |
| Responsive design, detailed visual fidelity, broader accessibility checks, diagnostic harness failures | `test/e2e/design-fidelity.spec.ts`, `shell.spec.ts`, `diagnostics.spec.ts` |

Production AWS deployment, Cognito login, CloudFront routing, throttling/load behaviour, and network fault resilience are outside the local smoke assurance. `npm test`, `npm run test:integration`, `npm run test:e2e`, and `npm run test:foundation` retain their current meanings; the dedicated smoke command complements them.

S-034 completion means the contract is reviewable, traced to acceptance stories, concrete enough to implement, and candid about unsupported coverage. Execution evidence and executable fixtures belong to S-035/S-036.

## S-035 implementation notes

`test/e2e/smoke-data.ts` holds the fixed inputs. `test/e2e/smoke-fixtures.ts` extends the existing fixtures with a random invocation identity, owner read assertions, complete history pagination, mutation/rejection assertions, and resource cleanup. `test/e2e/smoke.spec.ts` runs all eleven named checkpoints on one poll created through the UI. It records generated poll, participant, date, and audit identities from responses. Publication currently performs a draft save followed by publication; both requests must append exactly one revision each. The draft save may repeat unchanged values.

All accepted writes verify action, entity, actor, operation-window timestamp, revision order, and unchanged prior history. Participant/availability/location edits also assert their concrete before/after values. Rejected and cancelled operations compare owner state, history, and the public projection when available. Observer convergence uses Playwright assertions rather than sleeps.

Two implementation boundaries remain explicit:

- **History value cells:** The current history UI shows `Changed values` in the Before/After cells for structured availability values. Its action summary does show `Changed availability from yes to no`. SM-07 asserts that summary and the existing placeholders, verifies exact `{ value: "yes" }` / `{ value: "no" }` through the authenticated history API, then undoes the captured revision through the UI. Detailed value-cell rendering is an application gap, not added in S-035.
- **Revocation versus regeneration:** SM-11 uses the repository-only hook described above. It requires `.devstack/processes.json` from the normal local startup script, matches its web/DynamoDB ports, permits only a loopback DynamoDB endpoint, and verifies the poll owner, stored hash, and capability-to-poll mapping before revoking this attempt's capability. Run it with the same table/region/hash environment as startup when overriding those settings. Configuration mismatch fails the checkpoint; it does not silently skip it. No production route, token rotation, or regeneration audit event is created.

The fixture closes both public contexts and the separate unauthenticated API context after success or failure. It does not start, stop, or reset the stack. S-037 adds immediate created-poll recording for wrapper runs; the wrapper removes their data by deleting owned tables. A direct run still retains its uniquely tagged poll.

Failure attachments include redacted browser/API-probe logs, all four service logs (or an unavailable-log note), role-labelled screenshots and public videos, and a sanitized summary containing the run ID, retained poll ID, checkpoint, browser role, last action, completed checkpoints, assertion differences, and last authoritative snapshot. The existing Playwright retention policy captures traces for the owner, both public contexts, and API contexts. Browser media/traces remain local and may contain capability URLs; sanitize before sharing. A successful run also attaches the checkpoint summary. The 180-second whole-journey ceiling and 15-second action/navigation limits provide headroom over the S-036 measurements below.

## S-036 verification evidence

This section records the historical S-036 behavior before S-037 added disposable tables; its retained poll IDs remain in shared local tables.

Verified on 3 October 2026 using Windows, Node 24.19.0, PowerShell 7.6.6, Docker Compose, and installed Playwright Chromium. Existing `.dynamodb/` contents were retained throughout. Every normal invocation started with no recorded stack, built through the normal startup script, created fresh browser/organiser/poll state, and completed SM-01–SM-11 with one worker and zero retries. All five invocations removed their recorded state and stopped the caller-owned API/Vite/Compose services, with no cleanup or diagnostic-copy errors.

| Invocation / evidence directory under `.devstack/smoke-runs/` | Command/configuration | Browser result | Whole command | Exit |
| --- | --- | --- | --- | --- |
| `20261003T095007750Z-0db24d1cfcc944879a75901e32be59e8` | `npm run test:smoke`; default ports | 11 checkpoints passed, 42.6 s | 59.1 s | 0 |
| `20261003T095138411Z-5fea5b0c603a4ef7801edbfe7944a8fe` | `npm run test:smoke`; same database, after automatic stop/start | 11 checkpoints passed, 38.7 s | 49.6 s | 0 |
| `20261003T095413646Z-43d300f7fc26472db7cb81d9ec8632ac` | `npm run test:smoke -- -WebPort 15174 -ApiPort 14001 -DynamoDbPort 18001` | 11 checkpoints passed, 49.5 s | 59.9 s | 0 |
| `20261003T095546639Z-26a9cc7dd5754dec88548137674d9a8d` | `npm run test:smoke` with temporary, deliberately incorrect title assertion in SM-06 | **Expected diagnostic failure**, five completed checkpoints; SM-06 identified | 41.9 s | 1 |
| `20261003T100452287Z-798413237ca344e9afe9bf765e31ab50` | `npm run test:smoke`; environment ports web/API/DynamoDB = 15175/14002/18002 and local hash-key override | 11 checkpoints passed, 44.4 s | 60.7 s | 0 |

The deliberate failure was a verification probe, not a product regression or successful smoke run. Its temporary assertion was removed before the final normal run. Evidence includes the SM-06 summary with expected/actual title, retained poll ID, five completed checkpoints, three screenshot files, videos for all browser roles, redacted API and all four service-log attachments, a trace ZIP, and a preserved HTML report. Runner exit 1 and cleanup were confirmed. Startup-error and already-recorded-stack branches were inspected but were not separately exercised in this verification batch.

Default runs produced different organiser identities and poll IDs (`2584ab26-079a-488a-98d9-3928a731bb33` and `342ae1a1-7791-4473-89dd-7ae6f9a318ab`). The parameter-override poll is `c6bf5282-ffbf-4ec1-965d-904a5bd7f096`; the expected failed attempt retained `30b2ffd7-aecd-4621-bd6e-2d93ad2b1c14`. The final normal poll ID is recorded in its `test-results/**/smoke-summary.json`. Successful summaries from the first three runs are inline HTML attachments; the final fixture also writes an inspectable JSON file on success or failure. No data reset, table deletion, or scan-and-delete was used. Here, clean/reset behaviour means new browser storage and new test identities on a stopped/restarted stack, with the persisted database preserved.

For the last run, the shell also deliberately supplied stale `DYNAMODB_ENDPOINT=http://127.0.0.1:19999` and `PUBLIC_BASE_URL=http://127.0.0.1:19998`; startup derived the correct 18002/15175 origins. A test-only `PUBLIC_TOKEN_HASH_KEY=s036-local-verification-hash-key` was inherited by both API and revocation helper. SM-11 passing confirms matching port/hash configuration. Table-name/region inheritance is preserved by the wrapper but custom table names and alternate regions were not separately exercised.

Focused quality checks all passed (exit 0):

```sh
node node_modules/typescript/bin/tsc -b --pretty false
node node_modules/typescript/bin/tsc --noEmit --strict --target ES2023 --module ESNext --moduleResolution bundler --types node test/e2e/smoke.spec.ts test/e2e/smoke-fixtures.ts test/e2e/smoke-data.ts
node scripts/check-format.mjs
node scripts/lint.mjs
node scripts/check-production-boundaries.mjs
node --test test/foundation/dev-harness.test.mjs
git diff --check
```

The existing dev-harness suite passed all three tests. No broader integration/e2e suite was run for S-036. T-077 is delivered by the dedicated wrapper/command and shared effective configuration; T-078 by the repeated fresh journeys, restart/port evidence, deliberate failure artifacts, and confirmed shutdown; T-079 by the finalized README, this contract, SM-01–SM-11 acceptance matrix, measured evidence, and explicit coverage limitations. Kanban entities/statuses were not changed during this implementation.
