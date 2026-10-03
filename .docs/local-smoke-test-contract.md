# Local smoke-test contract

## Purpose and delivery status

Epic E-010 / Story S-034 defines a repeatable local smoke journey across the application's critical facets. This contract completes T-071 (coverage), T-072 (scripted data and isolation), and T-073 (assertions, diagnostics, commands, and regression boundaries).

This is a specification for subsequent implementation. No smoke spec, seed script, or `test:smoke` npm command exists yet. S-035 implements the browser journey; S-036 integrates its command and verifies repeatability. A passing smoke run will demonstrate the checkpoints below, not certify all acceptance scenarios.

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

E2E filenames in the evidence column are relative to `test/e2e/` unless a full path is given. These are reuse/reference points, not a claim that the proposed combined journey already runs.

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
- Keep existing local data intact. There is no supported poll deletion workflow identified in the current application; retained smoke polls are acceptable, uniquely tagged, and must not affect results. Do not delete shared tables, scan-and-delete records, or reset `.dynamodb/` for setup or teardown.
- Close all browser/request contexts after success or failure. Preserve failure artifacts before stopping services. Report any retained poll IDs without exposing capabilities. Dedicated disposable tables may be added later only with explicit harness ownership and validated configuration; they are not required for this browser contract.
- S-036 must verify two successive runs against the same persisted local database, a run after stop/start, and a run with overridden ports. Record actual durations and outcomes; no duration has been measured for the future smoke suite yet.

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

## Command expectations

Current supported commands are documented in README: `npm run dev`, `npm run test:e2e`, and `npm run dev:stop`. Playwright does not start services. There is no executable smoke command in S-034.

S-035 should provide `test/e2e/smoke.spec.ts`, runnable against an already-running stack with `npx playwright test test/e2e/smoke.spec.ts --project=chromium --workers=1 --retries=0`. This is a future invocation, not a command that can currently validate the contract.

S-036 should expose `npm run test:smoke` for that targeted suite. Its initial contract expects an already-running stack, leaves that stack running, propagates failure exit codes, and never resets data. The documented complete workflow should start with `npm run dev` and stop with `npm run dev:stop`, using `try/finally` when scripted so failures still stop only the caller-owned stack. Automated stack management can be an additional explicitly documented wrapper; it must not stop somebody else's reused stack.

Prerequisites: README's Node/npm, PowerShell, Docker, dependencies, and installed Chromium. Respect `WEB_PORT` for Playwright base URL and the matching `API_PORT`/`DYNAMODB_PORT` used at startup; route browser/API requests through the configured web origin when possible. Do not hardcode `15173` in smoke helpers. Any direct DynamoDB revocation helper must use the same endpoint, tables, and hash configuration as the running local API.

Use zero retries for repeatability evidence so a flaky first attempt cannot be reported as an unqualified pass. A CI retry, if later retained, gets fresh data and must expose the first failure. Publish actual timings in S-036 before setting a realistic whole-journey timeout. An absent checkpoint must be reported as a gap rather than a full-coverage success.

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

Production AWS deployment, Cognito login, CloudFront routing, throttling/load behaviour, and network fault resilience are outside the local smoke assurance. `npm test`, `npm run test:integration`, `npm run test:e2e`, and `npm run test:foundation` retain their current meanings; the future smoke command complements them.

S-034 completion means the contract is reviewable, traced to acceptance stories, concrete enough to implement, and candid about unsupported coverage. Execution evidence and executable fixtures belong to S-035/S-036.
