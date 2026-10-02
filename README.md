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
- [`architecture.md`](.docs/architecture.md): production and local architecture, data model, API, security, testing.
- [`acceptance-use-cases.md`](.docs/acceptance-use-cases.md): acceptance stories US-01 to US-38, written for Playwright.
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

- **Node.js 24** (the version CI uses) and **npm 11**
- **PowerShell 7+** (`pwsh`), which runs the dev-stack scripts on Windows, macOS and Linux
- **Docker** with Docker Compose, which runs DynamoDB Local
- No AWS account or credentials are needed to run locally

Install dependencies and the Playwright browser:

```sh
npm ci
npx playwright install chromium
```

## Running the application locally

```sh
npm run dev        # build, start DynamoDB Local, the API and Vite
npm run dev:stop   # stop only the processes/containers the start script launched
```

When `npm run dev` finishes it prints the URL. By default the app is at <http://127.0.0.1:15173>.

| Service | Default port | Override |
| --- | --- | --- |
| Web (Vite) | `15173` | `WEB_PORT` |
| API | `14000` (health check: `/health`) | `API_PORT` |
| DynamoDB Local | `18000` | `DYNAMODB_PORT` |

`npm run dev` writes its process state to `.devstack/processes.json` and its logs to `.devstack/service-logs/`. It refuses to start while a recorded stack exists, so if it reports that a stack is already running, run `npm run dev:stop` first. If DynamoDB is already listening on the configured port, the script reuses it and leaves it running on stop.

To create the local tables without starting the whole stack, run `npm run tables:init`.

## Running the tests

The tests have three layers, and each needs a different amount of infrastructure.

| Layer | Location | Runner | Needs |
| --- | --- | --- | --- |
| Foundation (unit, contract, boundary) | `test/foundation/*.test.mjs` | `node --test` | Nothing |
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

### Integration tests

These tests use the backend's local composition against a real DynamoDB Local. Each run creates its own uniquely suffixed tables, so runs do not interfere with each other or with your dev data.

```sh
docker compose -p invite-a-gent-local up -d dynamodb   # or: npm run dev
npm run test:integration
docker compose -p invite-a-gent-local down             # or: npm run dev:stop
```

The tests connect to `DYNAMODB_ENDPOINT` if it is set. Otherwise they use `http://127.0.0.1:${DYNAMODB_PORT:-18000}`.

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
| `npm run tables:init` | Idempotently create local DynamoDB tables |

## Configuration

`.env.example` lists the backend variables (`APP_ENV`, `PORT`, `AWS_REGION`, `DYNAMODB_ENDPOINT`, `APP_TABLE_NAME`, `AUDIT_TABLE_NAME`, `PUBLIC_BASE_URL`, `AUTH_MODE`). Put local overrides in an ignored `.env.local`, and never commit real secrets. The dev-stack script sets `DYNAMODB_ENDPOINT`, `API_PORT`, `WEB_PORT` and `PUBLIC_BASE_URL` itself, based on the ports it resolves.
