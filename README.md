# Invite-a-Gent

Invite-a-Gent helps a group choose a date for a get-together. An authenticated **organiser** proposes several dates and publishes a poll behind an unguessable public link. **Participants** open the link without an account, record Yes/No availability in a shared, wiki-like table and see a live ranking of the most popular dates. The organiser reviews the full audit history, undoes changes, selects a final date (which closes the poll), and can reopen the poll or regenerate the link.

## Poll lifecycle

| State | Who can see it | What can change |
| --- | --- | --- |
| **Draft** | Organiser only | Title, details, location, time zone, proposed dates. No responses yet. |
| **Open** | Anyone with the public link | Participant rows and availability (every change is audited). Organiser can edit location, undo, select a final date. |
| **Closed** | Anyone with the public link | Dates and responses are read-only; ranking is frozen. Organiser can still edit location, reopen the poll, or rotate the link. |

The owning organiser can set, edit, or clear location in every state. In Draft, save the Location field and use Preview; on an Open or Closed poll, use **Edit location** in the organiser toolbar. The dialog keeps the poll's state unchanged, previews safe Markdown, and offers **Save location** and **Clear location**. Saved changes appear on the public page immediately and each creates one audit revision with the previous and new value. Invalid text stays available for correction without replacing saved content. Location supports up to 4,000 Unicode code points, paragraphs, line breaks, emphasis, lists, and HTTPS links; raw HTML and unsafe links are rejected.

On a Closed poll, the owning organiser can choose **Reopen poll…** and confirm **Reopen poll**. Cancelling leaves the decision, responses, and history unchanged. Confirmation restores participant editing and live ranking, and the previous final date is shown as **Provisional** until the organiser picks the same or another date and confirms closure again. Each reopen and close creates a distinct audit revision; earlier decisions and responses remain in History. The public link continues to work throughout.

## My polls: finding and managing your polls

Normal organiser entry at `/` opens **My polls**. Choose **Create poll** to open the draft editor, save the details and proposed dates, and use **My polls** to return to the list. Creation works from every filter; returning after creating a poll starts with Active and blank search.

| Filter | Polls shown |
| --- | --- |
| **Active** (default) | Draft and Open polls; Active is a grouping, not a lifecycle state |
| **Draft** | Private, unpublished polls |
| **Open** | Published polls accepting participant changes |
| **Closed** | Polls with a confirmed final date and read-only responses |

**Search poll titles** searches within the selected filter. It matches a contiguous title substring after Unicode NFC normalization, trimming, collapsing Unicode whitespace, and locale-independent lowercasing. Blank or whitespace-only search shows all titles in that filter. Accents and punctuation remain significant; descriptions, dates and participant names are not searched. Search accepts up to 200 Unicode code points. Changing filters keeps the search text; **Clear search** keeps the filter and returns focus to the search field. Filter and search controls remain usable during loading, errors and no-match results.

Desktop shows a table; mobile shows cards with the same information:

| Summary | Meaning |
| --- | --- |
| **Title** | Opens the owned poll: Draft goes to its editor; Open or Closed goes to organiser management |
| **Status** | The saved Draft, Open or Closed lifecycle state |
| **Created** | Original creation date in the poll's time zone, in en-GB style with a year, such as `4 Oct 2026` |
| **Proposed dates** | Every saved choice, in saved order, with a year; date-only choices stay calendar dates, while timed choices include local time, time zone and saved UTC offset to distinguish repeated DST times. An incomplete draft shows **No dates proposed** |
| **Participants** | Current participant rows, including rows with no answers; an empty poll shows **0 participants** |

The list is newest-created first, using the original UTC creation instant rather than the displayed date. Equal instants use descending poll ID. Edits, publication, closure, participant changes and reopening never change the creation time or move a poll ahead of a newer one.

The editor and organiser management views provide a **My polls** return link. Returning from an existing poll retains that tab's filter/search and reads page one again, including current participant counts; previously loaded pages are discarded. A fresh entry defaults to Active with blank search. Successful save, publish, close and reopen actions invalidate old dashboard results. Restored browser documents also refetch on persisted `pageshow`; native browser-cache restoration has component-event coverage, not a verified native-cache acceptance run. The dashboard has no timer, focus or visibility refresh: return or reload for a fresh list.

Publication keeps you on organiser management with the newly issued share link. On returning, the poll appears in Active/Open and leaves Draft. Confirming final-date selection closes the poll, freezes ranking and participant/date editing, and moves it from Active/Open to Closed. Confirmed reopening returns it to Active/Open and removes it from Closed, restores collaboration/live ranking and marks the previous selection Provisional. Cancellation changes nothing. Responses, earlier decisions, history and the public link survive close/reopen; the original creation order still applies. These actions use the existing management confirmations, not inline dashboard buttons.

### Ownership and public links

Locally, the browser sends the guarded `x-local-organiser-id` header. Normal entry uses `local-organiser-browser`; a `testRunId` URL parameter derives a separate simulated identity for fixtures. Use the same identity to find or reopen your local polls. The server checks ownership for both listing and individual poll access. Missing/invalid identity is unauthenticated; another organiser's detail route is forbidden. This simulation has no sign-in or identity-switch control and is enabled only for local/test adapters.

Production ownership must come from the verified Cognito JWT subject. Lambda adapter contracts enforce that boundary, but production browser sign-in, authorizers, infrastructure and live AWS verification remain pending. The local header is not production authentication.

Participants open `/p/<token>` directly without an account or dashboard detour, even if conflicting organiser query parameters are present. A public capability grants access to that poll, never the organiser list or management actions. Management reached by poll ID shows responses read-only; participant editing uses the public link. Dashboard summaries and owned detail responses contain no share capability. Publication retains the issued link in the current management document; recovering it on a later dashboard visit is not implemented.

### Pages, loading and errors

My polls requests up to 25 matching summaries initially; the API allows page sizes of 1–50. **Load more** appends results in creation order and deduplicates poll IDs. There are no numbered pages or total-result count. Search/filter changes restart page one. The server examines at most 200 candidates per request, so a page may contain fewer matches, or none, while still having a continuation. Exhaust that continuation before treating the query as empty. Pages form a live list, not a snapshot; concurrent changes can affect membership. The creation index is eventually consistent, so a newly created poll may require another fresh read.

| State | What you see and can do |
| --- | --- |
| First page / another page loading | **Loading your polls…** / **Loading more polls…**; duplicate loads are prevented |
| Empty page with continuation | **More polls may match.**; continue with **Load more** |
| Exhausted list, blank search | **No active polls yet.**, **No draft polls yet.**, **No open polls yet.**, or **No closed polls yet.**; Create poll remains available |
| Exhausted list, nonblank search | **No polls match your search.**; use **Clear search** or another filter |
| First-page failure | **We couldn't load your polls.**; **Try again** retains filter/search |
| Later-page failure | **We couldn't load more polls.**; loaded entries remain and **Try again** retries the same continuation |
| Authentication failure | **Sign in to view your polls.**; summaries and continuation are cleared. Locally, check the simulated identity/configuration |

Failures are distinct from empty successful lists, and responses from earlier queries or identities cannot replace current results. Continuations expire after 15 minutes; API restart without a stable cursor secret also invalidates them. These failures use the generic later-page error: Try again does not refresh an invalid cursor. Reload My polls or change the query to start page one. Dashboard reads never change poll versions or append audit events.

See the [My polls requirements](.docs/user-requirements-my-polls.md), [MP-US-01–11 acceptance and evidence](.docs/acceptance-use-cases-my-polls.md#story-traceability-and-delivery-boundaries), and [storage/authentication architecture](.docs/architecture.md#56-my-polls-contract-and-storage-implementation-s-043--s-044) with [browser routes and freshness](.docs/architecture.md#57-my-polls-browser-routes-freshness-and-identity-boundaries).

## Architecture

The production target is a serverless AWS application in `eu-west-2`:

- **Frontend**: React + Vite SPA, served from private S3 through CloudFront.
- **API**: CloudFront routes `/api/*` to API Gateway and Node.js Lambda functions, which are deployed as ZIP archives.
- **Auth**: Cognito for organisers. Participants are authorised by a 192-bit random public token; only its hash is stored.
- **Data**: DynamoDB, with a current-state table and a separate immutable audit table. Writes are transactional and use last-update-wins semantics with a poll-wide version.
- **Infrastructure**: AWS CDK v2 (TypeScript).

For local development and testing, the whole application runs offline. Thin local adapters replace the AWS edge services, and the domain services, repositories and validation stay the same:

```text
Browser / Playwright ──▶ Vite dev server (React SPA) ──/api/* proxy──▶ Local Node.js HTTP adapter
                                                                        ├─ local auth adapter
                                                                        └─ DynamoDB Local (Docker)
```

Local organiser authentication uses a test-only header (`x-local-organiser-id`). It is enabled only when `APP_ENV` is `local` or `test` and is never included in a Lambda entry point.

Full design documentation lives in [`.docs/`](.docs/):

- [`user-requirements.md`](.docs/user-requirements.md): functional requirements.
- [`user-requirements-my-polls.md`](.docs/user-requirements-my-polls.md): organiser dashboard requirements and resolved decisions.
- [`architecture.md`](.docs/architecture.md): production and local architecture, data model, API, security, testing.
- [`acceptance-use-cases.md`](.docs/acceptance-use-cases.md): acceptance stories US-01 to US-38, written for Playwright.
- [`acceptance-use-cases-my-polls.md`](.docs/acceptance-use-cases-my-polls.md): MP-US-01–11 dashboard scenarios, test traceability and delivery limits.
- [`design/`](.docs/design/): UI hand-off notes and HTML prototypes.

## Repository layout

```text
.docs/               Requirements, architecture, acceptance cases, UI design
backend/             Domain services, DynamoDB repositories, Lambda + local adapters
frontend/            React/Vite SPA
infra/               AWS CDK app
packages/contracts/  Shared API schemas, types and error codes
scripts/             Dev-stack, table initialisation and quality-check scripts
test/foundation/     Node test-runner unit and contract tests (no services needed)
test/integration/    Node test-runner tests against DynamoDB Local
test/e2e/            Playwright browser tests against the full local stack
compose.yaml         DynamoDB Local container
```

## Prerequisites

- **Node.js 24** and **npm 11.6.0** (the versions declared by CI and `package.json`)
- **PowerShell 7+** (`pwsh`), which runs the dev-stack scripts on Windows, macOS and Linux
- **Docker Engine** with the Docker Compose plugin, running and available to your user; it runs DynamoDB Local
- A supported browser runtime for Playwright. Install Chromium with the command below; on Linux, install its OS dependencies with `npx playwright install --with-deps chromium` if they are not already present.
- No AWS account or credentials are needed to run locally

Install dependencies and the Playwright browser:

```sh
npm ci
npx playwright install chromium
```

The CI workflow currently uses Node.js 24, runs `npm ci`, installs Chromium (and Linux browser dependencies), then runs `npm run test:foundation`. `npm ci` uses the committed lockfile and expects it to match `package.json`.

## Running the application locally

```sh
npm run dev        # build, start DynamoDB Local, the API and Vite
npm run dev:stop   # stop only the processes/containers the start script launched
```

When `npm run dev` finishes it prints the URL. By default the app is at <http://127.0.0.1:15173>. The start script builds the TypeScript workspaces, starts DynamoDB Local if it is not already answering on the configured port, waits for DynamoDB readiness, starts the API and waits for `/health`, then starts Vite and waits for its HTTP response. The API initializes the local tables during startup; `npm run tables:init` is available when you want to create them separately.

| Service | Default port | Override |
| --- | --- | --- |
| Web (Vite) | `15173` | `WEB_PORT` |
| API | `14000` (health check: `/health`) | `API_PORT` |
| DynamoDB Local | `18000` | `DYNAMODB_PORT` |

`npm run dev` writes its process state to `.devstack/processes.json` and its logs to `.devstack/service-logs/` (`api.out.log`, `api.error.log`, `vite.out.log`, and `vite.error.log`). It refuses to start while a recorded stack exists, so if it reports that a stack is already running, run `npm run dev:stop` first. Shutdown stops only the recorded API/Vite processes and removes the DynamoDB container only when this start script created it. If DynamoDB was already answering on the configured port, the script reuses it and leaves it running on stop. DynamoDB data persists under `.dynamodb/`; stopping the stack does not erase it.

To use alternate ports in PowerShell, set the environment variables before starting the stack. Keep `WEB_PORT` set in the same shell when running Playwright so its base URL matches:

```powershell
$env:DYNAMODB_PORT = '18001'
$env:API_PORT = '14001'
$env:WEB_PORT = '15174'
npm run dev
npm run test:e2e
npm run dev:stop
Remove-Item Env:DYNAMODB_PORT, Env:API_PORT, Env:WEB_PORT
```

The startup script also accepts `-DynamoDbPort`, `-ApiPort`, and `-WebPort` when invoked directly through `pwsh -File scripts/Start-DevStack.ps1`; environment variables are easier when the browser tests need the matching web port.

To create the local tables without starting the whole stack, run `npm run tables:init`.

### Dashboard schema and existing local data

With DynamoDB Local reachable, both API startup and `npm run tables:init` create missing application/audit tables and run dashboard maintenance before requests are served. Default names are `invite-agent-local-app` and `invite-agent-local-audit`. Set `APP_TABLE_NAME`/`AUDIT_TABLE_NAME` consistently for custom tables. Standalone initialization honors `DYNAMODB_ENDPOINT`, otherwise `DYNAMODB_PORT`; startup derives its loopback endpoint from `DYNAMODB_PORT`.

The application table uses string `PK`/`SK` keys and an ACTIVE `GSI1` with string `GSI1PK`/`GSI1SK` keys and ALL projection. Poll metadata uses `GSI1PK = ORGANISER#<organiserId>` and `GSI1SK = POLL#<createdAt>#<pollId>`. The audit table uses string `PK`/`SK` keys. No separate dashboard table or seed command is needed.

Maintenance scans all application-table pages, backfills missing legacy participant counts across all participant-query pages (excluding name locks), and validates creation keys and summary fields. Conditional writes retry contention and preserve poll versions, original creation times and audit history. Existing creation keys are checked, not rewritten. List requests use the owner index and metadata reads; they do not run scans or migrations. Initialization creates missing tables but does not add/repair an index on an existing table, reset data, or fix corrupt summaries. See [dashboard troubleshooting](#troubleshooting-local-development) for failed validation or migration.

Local composition generates a random per-process cursor signing secret by default. An optional `DASHBOARD_CURSOR_SECRET` of at least 32 bytes allows otherwise-valid continuations to survive API restarts; keep it private and outside committed files. Rotation invalidates old continuations. Production needs protected, stable configuration and the separate index/count/authentication handoff in [architecture section 5.6](.docs/architecture.md#56-my-polls-contract-and-storage-implementation-s-043--s-044); these local commands are not a production migration procedure.

## Running the tests

The test layers need different amounts of infrastructure.

| Layer | Location | Runner | Needs |
| --- | --- | --- | --- |
| Foundation (unit, contract, boundary) | `test/foundation/*.test.mjs` | `node --test` | Nothing |
| Frontend component | `test/component/*.test.mjs` | `node --test` + intercepted browser requests | Playwright Chromium or an installed browser channel; no services |
| Integration | `test/integration/*.test.mjs` | `node --test` | DynamoDB Local |
| End-to-end | `test/e2e/*.spec.ts` | Playwright (Chromium) | Full dev stack |

### Run everything (same as CI)

```sh
npm run test:foundation
```

This command:

1. runs all foundation tests;
2. starts the dev stack;
3. runs the full Playwright suite;
4. stops the dev stack, even when a step fails.

The GitHub Actions workflow (`.github/workflows/foundation.yml`) runs this command on every pull request and every push to `main`.

The integration tests are **not** part of this command. Run them separately (see below).

### Foundation tests

These need no services.

```sh
npm test            # build + production-boundary check + all test/foundation tests
npm run test:unit   # build + contracts and backend-validation tests only
npm run test:boundaries  # production-boundary script + boundaries.test.mjs
```

Run a single file or filter by test name:

```sh
npm run build
node --test test/foundation/ranking.test.mjs
node --test --test-name-pattern="undo" test/foundation/*.test.mjs
```

### Frontend component tests

```sh
npm run test:component
```

This builds and runs all component suites, including My polls summaries, loading/errors, search, navigation and lifecycle returns. The harness builds the real frontend in memory and intercepts requests, so it needs no API, DynamoDB or dev stack. Install Chromium as above; on Windows it falls back to installed Edge when Chromium is absent. `COMPONENT_BROWSER_CHANNEL` selects an installed Playwright browser channel. Component tests run separately from `npm test`, `test:foundation` and `check`.

### Integration tests

These tests use the backend's local composition against a real DynamoDB Local. Each run creates its own uniquely suffixed tables, so runs do not interfere with each other or with your dev data.

```sh
docker compose -p invite-a-gent-local up -d dynamodb   # or: npm run dev
npm run test:integration
docker compose -p invite-a-gent-local down             # or: npm run dev:stop
```

The tests connect to `DYNAMODB_ENDPOINT` if it is set. Otherwise they use `http://127.0.0.1:${DYNAMODB_PORT:-18000}`.

For the focused My polls discovery verification (T-119), start the local stack and run `npm run test:discovery`. This runs pure rules/contracts, frontend query components, API/repository cases and live desktop/mobile filter/search tests together, stopping on failure. See [combined discovery evidence](.docs/acceptance-use-cases-my-polls.md#s-047-combined-discovery-verification-t-119) for the matrix and pagination cases. Use the same endpoint/table/port environment as the stack; the command leaves service ownership with the caller.

Run one file:

```sh
npm run build
node --test test/integration/publication.test.mjs
```

### End-to-end (Playwright) tests

Playwright does **not** start the servers. Start the stack first:

```sh
npm run dev
npm run test:e2e
npm run dev:stop
```

Useful variations:

```sh
npx playwright test test/e2e/public-poll.spec.ts   # one spec file
npx playwright test -g "undo"                      # filter by test title
npx playwright test --headed                       # watch the browser
npx playwright test --ui                           # interactive UI mode
npx playwright show-report                         # open the last HTML report
```

By default, Playwright runs tests in parallel across several workers locally. Under that load, a few tests in `collaborative-availability.spec.ts` can intermittently time out waiting for a newly added row or validation message. CI avoids this by running with one worker and two retries. For a reliable local run, do the same:

```sh
npx playwright test --workers=1
```

Playwright uses `http://127.0.0.1:${WEB_PORT:-15173}` as its base URL, so if you changed `WEB_PORT` for the stack, set the same value when you run the tests. On failure it keeps traces, screenshots and videos in `test-results/`, and it writes the HTML report to `playwright-report/`. The service logs are in `.devstack/service-logs/`.

### Focused My polls verification

`npm run test:discovery` above combines discovery contracts, components, real API/repository checks and desktop/mobile search/filter journeys. For navigation and lifecycle verification, use the established runners:

```sh
# No services (component files need a browser runtime):
npm run build
node --test test/foundation/my-polls-lifecycle.test.mjs test/component/my-polls-lifecycle.test.mjs test/component/my-polls-loading.test.mjs test/component/organiser-navigation.test.mjs

# DynamoDB Local required; these fixtures delete only their own tables:
node --test test/integration/my-polls-lifecycle.test.mjs

# Full dev stack required; one Chromium worker, zero retries:
npx playwright test test/e2e/organiser-navigation.spec.ts test/e2e/navigation-guards.spec.ts test/e2e/my-polls-search.spec.ts test/e2e/my-polls-lifecycle.spec.ts --project=chromium --workers=1 --retries=0
```

Keep the stack's `DYNAMODB_ENDPOINT`/`DYNAMODB_PORT`, `APP_TABLE_NAME`, `AUDIT_TABLE_NAME` and `WEB_PORT` consistent in the test shell. These direct commands and `test:discovery` leave service ownership with the caller. Integration fixtures own disposable table pairs; direct browser tests create fresh identities but retain polls in the configured local tables until explicit cleanup. The smoke wrapper alone supplies its per-run table teardown. Test references and known production/native-cache limits are in [My polls acceptance evidence](.docs/acceptance-use-cases-my-polls.md#story-traceability-and-delivery-boundaries); this guide does not claim a new regression or smoke run.

### Local smoke test

After installing the prerequisites, run this from a stopped dev stack:

```sh
npm run test:smoke
```

This builds and starts the normal local stack, runs only [smoke.spec.ts](test/e2e/smoke.spec.ts) in Chromium with one worker and zero retries, saves diagnostics, and stops the services it started in `finally`, including on test failure. It refuses to run if `.devstack/processes.json` already exists; it does not stop that existing stack. DynamoDB already answering on the selected port is reused and left running, following `npm run dev` ownership rules. The existing `dev`, `dev:stop`, `test:e2e`, and `test:foundation` commands keep their meanings.

The journey begins at My polls with Active selected, creates/saves a fresh private draft, returns to its summary and opens it by title. It prepares dates, publishes and copies the issued public link, then verifies dashboard membership and title navigation in Open, Closed and reopened states. Refreshed summaries retain the original creation date and show current participant counts without adding audit revisions. Two independent public views still exercise collaboration, ranking, location validation, history/undo, access control, closure/reopening and revoked-link rejection. Detailed search, pagination and mobile permutations stay in the dedicated dashboard E2E suites. Success reports `1 passed`, eleven completed SM-01–SM-11 checkpoints in the `smoke-summary.json` attachment, and exit code 0. Startup or assertion failure returns nonzero. Each attempt uses empty browser storage and a new organiser/poll identity; no separate seed command is needed. See [checkpoint traceability](.docs/local-smoke-test-contract.md#checkpoints-and-acceptance-traceability).

Each wrapper run provisions `invite-agent-smoke-app-<runId>` and `invite-agent-smoke-audit-<runId>` with the normal application/audit schemas. It overrides inherited `APP_TABLE_NAME` and `AUDIT_TABLE_NAME` for the API and test helpers. Shared development tables and earlier retained smoke polls are preserved. After collecting diagnostics, shutdown stops the API/web processes, deletes only this run's tables while DynamoDB is reachable, and then stops DynamoDB if it started it. This also applies to failed startup or browser tests. Deleting these disposable tables permanently removes that run's poll, participant, capability, index, and audit records; the evidence remains.

`manifest.json` in the evidence directory records schema version, run ID, local endpoint/region, both table names, creation/ownership and cleanup results, and every created poll ID. The fixture records IDs immediately; teardown also discovers any polls whose create response was lost, using a paginated scan confined to the owned application table. Ownership requires exact names derived from the run ID plus a matching metadata marker containing the run ID, table role, project owner, and random nonce. Table collisions are rejected rather than reused. Only explicit loopback HTTP DynamoDB endpoints are allowed. Cleanup failure returns nonzero and records the reason in the manifest; an ownership mismatch preserves the table for inspection. Abrupt process termination or an unavailable database can leave tables behind.

Success requires passing tests and successful teardown. Cleanup failure changes a passing test's exit to 1; a browser failure retains its nonzero exit and records cleanup separately. Diagnostic-copy errors are recorded but do not themselves fail a passing run. Inspect both table `cleanup` states (`pending`, `deleted`, `absent`, `failed`) and `cleanupError`, plus `summary.json.cleanupFailure`: missing process state alone does not prove deletion. A foreign manifest path in recorded stack state makes the wrapper refuse shutdown and retain that state. The manifest is created without overwrite and updated atomically during provisioning, poll recording, and teardown; preserve its identity, targets, and nonce for recovery.

### Retained local-data cleanup

The cleanup utility is local-only and defaults to a dry run. It requires an explicit loopback HTTP DynamoDB endpoint, refuses `APP_ENV` values other than `local` or `test`, never performs a broad table scan, and requires `--confirm` before deleting anything. Use an explicit poll ID for retained data in the shared local tables:

```powershell
npm run cleanup:local -- --poll-id '<poll-id>' --endpoint http://127.0.0.1:18000 --app-table invite-agent-local-app --audit-table invite-agent-local-audit --dry-run
npm run cleanup:local -- --poll-id '<poll-id>' --endpoint http://127.0.0.1:18000 --app-table invite-agent-local-app --audit-table invite-agent-local-audit --confirm
```

For an ephemeral smoke run, use its saved manifest at `.devstack/smoke-runs/<run-id>/manifest.json`. The utility previews the manifest's exact tables and recorded poll IDs, then deletes only those polls after confirmation; it leaves tables, ownership markers, unrecorded polls, and evidence in place:

```powershell
npm run cleanup:local -- --run-id '<run-id>' --dry-run
npm run cleanup:local -- --run-id '<run-id>' --confirm
```

Poll cleanup removes metadata (including the dashboard participant count), participants, participant-name indexes, the public-token capability, and all paginated audit events with bounded DynamoDB batch writes. Deleting metadata also removes its GSI1 entry; there is no separate dashboard record to clean. Missing records are reported as already missing; an incomplete poll record reports the capability as unresolved rather than guessing a token key. Run cleanup validates the manifest and, before mutation, its per-table ownership markers. A mismatched marker, non-loopback endpoint, invalid manifest, missing table name, or conflicting mode is a hard refusal. Table teardown remains the smoke wrapper's responsibility; use the manifest's recorded evidence and cleanup status for recovery when a process stops unexpectedly.

Cleanup keeps poll metadata until dependent deletes succeed, so rerunning the same confirmed command can recover from a partial failure. Missing application or audit tables are handled independently. Capability ownership must match the requested poll. Run cleanup reports each poll's result, continues with other recorded polls after a poll failure, and exits nonzero if any fail; inspect the reported error and rerun after correcting its cause. Existing tables require matching ownership markers even when the manifest says they were previously deleted.

Run these cleanup examples from the repository root with DynamoDB Local reachable, replacing quoted placeholders with actual recorded IDs. Review endpoint, tables, counts, `missing`, and `unresolved` before confirming. There is no interactive prompt. Stop writers to the selected polls: deletion is not transactional and does not lock the API. Poll mode trusts supplied table names without smoke markers, so a mistaken selection can permanently delete developer data. It deletes the poll partition (including embedded dates/state), its current capability, and paginated `EVENT#` audit records; other audit key types survive.

The record CLI permits unset `APP_ENV` as well as `local`/`test`. Endpoints require HTTP with hostname exactly `127.0.0.1` or `localhost`, an explicit port, and no credentials, extra path, query, or fragment; HTTPS and IPv6 loopback are rejected. Poll mode can use `DYNAMODB_ENDPOINT`, `APP_TABLE_NAME`, and `AUDIT_TABLE_NAME`, but does not derive an endpoint from `DYNAMODB_PORT`. Run mode uses manifest targets; an optional `--endpoint` must match, and table-name flags do not override them. `--manifest` selects an archived manifest in run mode, still named `manifest.json` inside a directory matching the run ID. `--dry-run --confirm` is rejected. See the [complete flag and recovery guide](.docs/local-cleanup-operations.md).

Historical pre-S-037 smoke runs have no ownership manifest and retain their polls in shared tables; use explicit poll IDs from their summaries and the actual local table configuration. Ordinary development and direct Playwright data also remain until explicitly selected. Confirmed deletion removes history permanently; retry recovery finishes deletion and cannot restore data. Evidence is not a database backup. The CLI prints JSON/errors to stdout/stderr without saving a report or updating the manifest. Exit 0 can include unresolved capabilities or an empty recorded poll list; inspect the result.

The internal `node scripts/smoke-run-resources.mjs cleanup '<manifest-path>'` operation **immediately deletes whole owned tables**, including unrecorded data, with no dry run, confirmation, or `APP_ENV` gate. It is the wrapper's teardown mechanism. Follow the [interrupted-run recovery procedure](.docs/local-cleanup-operations.md#interrupted-run-recovery), and never forge markers or edit manifest identity/flags to bypass refusal.

### Clear all local application data

`cleanup:all` is a separate, explicitly invoked reset for S-042. It discovers the exact shared `invite-agent-local-app` / `invite-agent-local-audit` tables, correctly formed smoke-run tables, and current UUID-named integration-test tables on one loopback DynamoDB Local endpoint. **Confirmed cleanup permanently deletes entire supported tables, indexes, polls, capabilities, and audit history**, including orphan/unrecorded data and empty tables. Stop writers and test runners first; keep the intended DynamoDB Local instance reachable.

```powershell
$env:APP_ENV = 'local'
npm run cleanup:all -- --endpoint http://127.0.0.1:18000 --dry-run
npm run cleanup:all -- --endpoint http://127.0.0.1:18000 --confirm 'DELETE ALL LOCAL DATA'
# Alternative for deliberate noninteractive execution:
npm run cleanup:all -- --endpoint http://127.0.0.1:18000 --force
```

Omitting authorization previews only. `--confirm` requires that exact phrase; there is no prompt. `--force` bypasses no safety checks. These flags cannot be combined with each other or `--dry-run`. `APP_ENV` must explicitly be `local` or `test`; endpoint comes from `--endpoint` or `DYNAMODB_ENDPOINT`, with no `.env.local` loading or port-derived default. Only literal HTTP `127.0.0.1`/`localhost` with a non-default explicit port is allowed; `localhost` is pinned to IPv4 loopback and redirects are not followed. Custom `APP_TABLE_NAME`/`AUDIT_TABLE_NAME` settings are refused. Verify the selected local service is not a tunnel to another environment.

The CLI emits JSON lines: a preview before writes, followed by per-table successes/skips/failures when authorized. It validates schemas and rechecks creation identity before deletion. Inspection failures prevent all deletion; later failures can leave a partial reset and return exit 1. Exit 0 can include excluded tables: inspect the report. Custom names, legacy non-UUID integration names, and prefix lookalikes are excluded. All files remain, including `.dynamodb/`, smoke manifests/logs, reports, configuration, and backups. Removing `.dynamodb/` would also discard unrelated data and is not part of this command.

After cleanup, supported tables are absent. Run `npm run tables:init` with the intended local configuration to recreate empty shared tables, including the dashboard's GSI1, then `npm run dev`; test fixtures create fresh tables on their next run. New polls initialize participant counts to zero. On failure, correct the cause, preview again, and repeat authorization. Recovery finishes deletion; restoration requires an independent backup. Reports and manifests are not backups, and this command does not update manifests or securely erase evidence. See the [full scope, exclusions, reporting and recovery contract](.docs/all-local-data-cleanup.md).

### Smoke configuration and evidence

The smoke wrapper accepts the same port environment variables as `npm run dev`, or explicit PowerShell parameters (parameters take precedence):

```powershell
$env:WEB_PORT = '15174'
$env:API_PORT = '14001'
$env:DYNAMODB_PORT = '18001'
npm run test:smoke
Remove-Item Env:WEB_PORT, Env:API_PORT, Env:DYNAMODB_PORT

# Equivalent, without changing the calling shell's environment:
npm run test:smoke -- -WebPort 15174 -ApiPort 14001 -DynamoDbPort 18001
```

The wrapper shares startup's effective `WEB_PORT`, `API_PORT`, `DYNAMODB_PORT`, derived `PUBLIC_BASE_URL` and loopback `DYNAMODB_ENDPOINT` with Playwright. Its owned table names are shared by the API and revocation helper; `AWS_REGION` and `PUBLIC_TOKEN_HASH_KEY` inherit the same shell configuration. `.env.local` is not automatically loaded. `-ReadinessTimeoutSeconds` overrides the normal 90-second startup deadline. Additional Playwright switches are not forwarded; to debug against your own running stack, use:

```sh
npx playwright test test/e2e/smoke.spec.ts --project=chromium --workers=1 --retries=0
```

Keep the same configuration used at startup in that shell, especially `WEB_PORT` and table/hash overrides. This direct command leaves the stack running and retains its created poll in that stack's tables; automatic disposable tables apply to the wrapper only.

The wrapper prints a unique evidence directory under `.devstack/smoke-runs/<runId>/`. It contains `manifest.json`, `summary.json` (phase, ports, exit codes, elapsed time, cleanup and diagnostic errors), `startup.log`, `playwright.log` once tests run, `shutdown.log` when the wrapper shuts down, and copies of service logs, `test-results/`, and `playwright-report/`. The wrapper and browser summary use the same run ID. These copies survive subsequent runs; top-level Playwright reports are replaced by the next run. Startup failures are labelled `startup` and do not copy an older browser report; service logs may be from an earlier start if failure precedes service launch. Logs missing during collection do not hide the original failure.

Inspect the latest report with `npx playwright show-report`, or a preserved report with `npx playwright show-report .devstack/smoke-runs/<runId>/playwright-report`. Failure attachments include the checkpoint/action summary, redacted API logs, service logs, traces, role screenshots, and videos. Browser artifacts and raw runner output can contain local capability URLs; sanitize before sharing. Use the summary's phase to distinguish startup trouble from a failed application checkpoint, fix the cause, then rerun `npm run test:smoke`.

On the verified Windows setup, four successful runs took 38.7–49.5 seconds in Playwright and 49.6–60.7 seconds including startup, build, evidence collection, and shutdown. Allow longer on a cold Docker/browser setup; the browser journey has a 180-second ceiling. Measured results and checkpoint-to-acceptance traceability are in the [smoke contract](.docs/local-smoke-test-contract.md). Limitations: link revocation uses an isolated repository hook, organiser link regeneration has no supported route/UI, and structured history Before/After cells currently show `Changed values` (exact availability values are verified through the owner API and action summary). This local journey does not verify production AWS/Cognito or replace the broader regression suites.

### Full quality gate

```sh
npm run check
```

This command runs, in order: format check, lint, type check, `npm test` (foundation tests), and the security check (`npm run security:check`). Like `npm test`, it does not run the integration or e2e tests.

## Other scripts

| Script | Purpose |
| --- | --- |
| `npm run build` | TypeScript project build (`tsc -b`) for all workspaces |
| `npm run typecheck` | Type check all workspaces |
| `npm run lint` | Lint |
| `npm run format:check` | Formatting check |
| `npm run security:check` | Security checks |
| `npm run tables:init` | Initialize local tables and prepare legacy dashboard counts/index validation |
| `npm run cleanup:local -- ...` | Preview or confirm explicit poll / manifest-recorded smoke poll deletion |
| `npm run cleanup:all -- ...` | Preview or deliberately delete all supported local application/audit/smoke/test tables |

## Configuration

`.env.example` documents backend configuration. The PowerShell dev-stack scripts do not automatically load `.env.local`: set overrides in the shell before `npm run dev` (for example, the port settings above). The start script derives `DYNAMODB_ENDPOINT` and `PUBLIC_BASE_URL` and sets `API_PORT`, `WEB_PORT`, and `DYNAMODB_PORT` for its child services. Do not put real secrets in local configuration or commit them.

## Troubleshooting local development

The organiser list API is `GET /api/organiser/polls`, using the existing local organiser identity header. Optional query parameters are `filter=active|draft|open|closed`, `search`, `pageSize` (1–50; default 25), and opaque `cursor`. Follow `nextCursor` even after an empty page. Lists are private, read-only and ordered by immutable creation time.

See [My polls navigation and states](#my-polls-finding-and-managing-your-polls) and [dashboard schema initialization](#dashboard-schema-and-existing-local-data) for the normal workflow. API query validation rejects unknown/duplicate parameters and malformed, expired, altered, foreign-owner or different-query cursors with 400; missing identity returns 401, non-owner detail access 403, and corrupt stored summaries 500. Do not edit or share opaque cursor values.

- **A recorded stack already exists:** Run `npm run dev:stop`, then retry `npm run dev`. The stop command reports when there is no recorded stack. If startup was interrupted before cleanup, inspect `.devstack/processes.json` and the service logs before taking any manual process action.
- **A port is already in use:** Choose another port by setting `DYNAMODB_PORT`, `API_PORT`, or `WEB_PORT` in PowerShell before startup. For browser tests, retain the same `WEB_PORT` in that shell. If DynamoDB is already listening on the selected DynamoDB port, startup treats it as an existing service and will not stop it later.
- **Docker or DynamoDB does not start:** Confirm Docker Engine is running and `docker compose version` succeeds for your user. Check `.devstack/service-logs/` and the Compose output from `npm run dev`. Startup uses a 90-second readiness deadline for DynamoDB, the API, and Vite; Docker may report a successful container start before DynamoDB itself is ready.
- **The API or web server times out:** Check `api.out.log`, `api.error.log`, `vite.out.log`, and `vite.error.log` in `.devstack/service-logs/`. Confirm the selected ports are free and that the API health URL (`http://127.0.0.1:<API_PORT>/health`) responds. A failed startup attempts to stop the processes it recorded; fix the underlying build, port, or service issue and retry.
- **Dashboard initialization fails:** Inspect `api.error.log` for the first migration/schema error rather than only the readiness timeout. `Dashboard requires ACTIVE creation-ordered GSI1 with ALL projection` means the selected app table lacks the required active index/schema; `tables:init` does not upgrade existing indexes. Verify endpoint/table settings and index readiness. `Existing poll requires creation-index repair before dashboard enablement` or invalid summary data requires inspection and explicit data repair, preserving original creation times. Do not invent zero counts or bypass validation. For `Count migration contention`, stop competing writers and rerun `npm run tables:init` with the same configuration. Missing counts are backfilled; corrupt data/keys are not repaired automatically. If deliberately discarding disposable local data, use the preview/confirmation workflow in [all-local cleanup](.docs/all-local-data-cleanup.md), then initialize again; custom tables are excluded by that cleanup command.
- **Load more repeatedly fails after an API restart or a long pause:** Restart-invalidated or expired cursors do not recover through Try again. Reload the dashboard or change its query to restart page one. A stable private local cursor secret preserves valid cursors across restarts, but not past their expiry.
- **My polls is empty or asks for sign-in:** Check the selected lifecycle filter, title search and simulated `testRunId` identity; Closed is excluded from Active, and a different local identity owns a different list. Clear search or select another filter. If a page says More polls may match, continue loading. Check API logs/configuration for authentication or server failures; errors are not empty lists. Reload for current summaries after collaboration or index propagation. Share diagnostics with query strings, cursors, capability URLs and secrets removed.
- **Playwright cannot reach the app:** Start the stack first; `npm run test:e2e` does not start or stop services. Confirm the browser-test shell has the same `WEB_PORT` used by the stack. If Chromium is missing, run `npx playwright install chromium` (on Linux, `npx playwright install --with-deps chromium`).
- **A browser test fails:** Inspect the HTML report with `npx playwright show-report`, plus traces, screenshots, and videos in `test-results/`. For a less contended local run, use `npx playwright test --workers=1`.
- **Local data looks unexpected:** DynamoDB Local stores data in `.dynamodb/`, which survives `npm run dev:stop`. Startup initializes tables and prepares legacy dashboard counts but does not reset contents. Use the explicit scoped/all-local cleanup commands above after reviewing their targets; preserve `.dynamodb/`, which may also contain unrelated tables.
