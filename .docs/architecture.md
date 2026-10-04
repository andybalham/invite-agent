# Invite Agent Architecture

## 1. Purpose and Scope

Invite Agent is a serverless web application that helps an organiser propose dates for a get-together, collect availability through a public link, rank the most popular dates, and select a final date.

This document defines the target architecture for the MVP described in [`user-requirements.md`](./user-requirements.md). It covers the production AWS topology, application boundaries, data model, API design, consistency model, authentication and public-link security, auditing and undo, deployment, and operations.

The design assumes:

- AWS region `eu-west-2` for regional resources.
- TypeScript throughout the frontend, backend, and infrastructure projects.
- React and Vite for the browser application.
- AWS CDK v2 for infrastructure as code.
- Node.js 22 for AWS Lambda functions.
- Lambda functions are deployed as ZIP archives, not container images.
- Production is available at `https://invite-agent.10printiamcool.com`.
- CloudFront provides a single public origin and routes `/api/*` to API Gateway.
- The Route 53 public hosted zone for `10printiamcool.com` already exists.
- The complete application can run locally for browser-based end-to-end testing without deployed AWS resources or AWS credentials.

## 2. Architectural Goals

The architecture prioritises:

1. **Simple operation** - a fully managed serverless platform with no continuously running compute.
2. **Predictable collaborative editing** - concurrent mutations use last-update-wins semantics, and every client refreshes from the latest server state without presenting conflict warnings.
3. **Complete traceability** - every successful mutation creates an immutable audit event.
4. **Clear access boundaries** - organisers authenticate through Cognito; public access is granted only by an unguessable, revocable poll link.
5. **Low deployment complexity** - one CDK application provisions the infrastructure and ZIP-based Lambda functions.
6. **Low cost** - usage-based AWS services suit the expected intermittent workload.
7. **Responsive reads** - a poll and its availability table can normally be rendered from one API request.

## 3. System Context

```text
┌──────────────┐
│  Organiser   │── Cognito sign-in ───────────────┐
└──────────────┘                                   │
        │                                          ▼
        │                                 ┌─────────────────┐
        └────── HTTPS ───────────────────▶│  Invite Agent   │
                                          │   Web App       │
        ┌────── HTTPS via public link ───▶│                 │
        │                                 └─────────────────┘
┌──────────────┐                                   │
│ Participant  │                                   │
└──────────────┘                                   │
                                                   ▼
                                          ┌─────────────────┐
                                          │      AWS        │
                                          │ serverless API  │
                                          └─────────────────┘
```

Organisers use authenticated management routes. Participants require no account; possession of an active public link grants read and, while the poll is open, edit access to that poll.

## 4. Production Architecture

```text
                                      ┌────────────────────────┐
                                      │ Route 53               │
                                      │ invite-agent.          │
                                      │ 10printiamcool.com     │
                                      └────────────┬───────────┘
                                                   │ Alias
                                                   ▼
┌───────────┐       HTTPS              ┌────────────────────────┐
│ Browser   │─────────────────────────▶│ CloudFront             │
│ React SPA │                          │ ACM TLS certificate    │
└─────┬─────┘                          └───────────┬────────────┘
      │                                          / \
      │                           default `/*`   /   \ `/api/*`
      │                                        ▼     ▼
      │                              ┌───────────┐  ┌────────────────┐
      │                              │ S3 bucket │  │ API Gateway    │
      │                              │ private   │  │ HTTP API       │
      │                              │ SPA assets│  └───────┬────────┘
      │                              └───────────┘          │
      │                                                     ▼
      │                                           ┌──────────────────┐
      │                                           │ Lambda functions │
      │                                           │ Node.js ZIP      │
      │                                           └────────┬─────────┘
      │                                                    │
      │                                  ┌─────────────────┐
      │                                  ▼                 ▼
      │                           ┌────────────┐   ┌──────────────┐
      │                           │ DynamoDB   │   │ CloudWatch   │
      │                           │ polls/data │   │ logs/metrics │
      │                           └────────────┘   └──────────────┘
      │
      └── organiser authentication ──▶ Amazon Cognito User Pool
```

### 4.1 DNS and TLS

- A Route 53 alias record maps `invite-agent.10printiamcool.com` to the CloudFront distribution.
- A dedicated CDK stack in `us-east-1` provisions an ACM certificate for `invite-agent.10printiamcool.com`; the main application stacks remain in `eu-west-2`.
- HTTP is redirected to HTTPS.
- TLS terminates at CloudFront; traffic from CloudFront to its origins also uses HTTPS where supported.

### 4.2 CloudFront routing

CloudFront exposes one browser origin:

| Path | Origin | Cache policy |
|---|---|---|
| `/api/*` | API Gateway HTTP API | Caching disabled; forward required headers, cookies, query strings, and methods |
| Static assets with content hashes | Private S3 bucket | Long-lived immutable caching |
| All other paths | Private S3 bucket | Short caching for HTML; a CloudFront Function rewrites recognised client-side routes to `/index.html` |

The viewer-request rewrite excludes `/api/*` and static files, so API errors cannot be replaced by the SPA fallback. Using one origin avoids production CORS configuration and keeps public links and API calls under the vanity domain. API Gateway's generated hostname is not presented as part of the public application contract.

The S3 bucket blocks all public access. CloudFront uses Origin Access Control to read objects.

## 5. Application Components

### 5.1 Frontend

The React SPA contains two route groups:

- **Organiser application** - sign-in, poll list, poll editor, preview, publishing, history, undo, link regeneration, date selection, closing, and reopening.
- **Public poll application** - poll details, collaborative availability table, totals, ranked dates, and the final selected date.

The SPA uses Cognito Authorization Code flow with PKCE for organiser sign-in. It keeps access tokens in memory where practical and does not persist credentials or public-link secrets in telemetry.

Every editable representation includes the current poll `version` so clients can recognise newer server state. Mutation requests do not submit an expected version. Each successful mutation returns the latest representation and version; the client replaces its displayed state with that server response. When a newer state is subsequently received, it replaces the older display without a conflict warning.

### 5.2 API Gateway

API Gateway provides an HTTP API under `/api/v1`.

- Organiser routes use a Cognito JWT authorizer.
- Public routes do not use Cognito; the backend validates the public-link token.
- Payload size, route throttling, and request validation provide first-line abuse protection.
- CloudFront forwards the `Authorization`, content, public-link token, and request-correlation headers needed by the API.

### 5.3 Lambda functions

Functions are grouped by trust boundary and workload rather than implemented as one unrestricted function:

| Function | Responsibility | Access |
|---|---|---|
| `organiser-api` | Authenticated poll lifecycle, date management, history, undo, link rotation, close/reopen | Poll table and audit table; organiser routes |
| `public-api` | Resolve active public links, read published polls, add/edit/remove participant rows | Restricted poll and audit access; public routes |
Each function:

- Uses the Node.js Lambda runtime and ARM64 unless a dependency requires x86_64.
- Is bundled with `esbuild` into a small production ZIP archive.
- Has an independent IAM role with least-privilege table and log permissions.
- Uses environment variables for non-secret resource identifiers.
- Emits structured JSON logs with a correlation ID.
- Has reserved concurrency and API throttling configured to bound unexpected cost.

There is no ECR repository, container build, or image bootstrap sequence. CDK builds or references the ZIP assets and publishes them through its normal asset bucket during deployment.

### 5.4 Cognito

A Cognito User Pool authenticates organisers. Self-registration should be disabled initially; organisers are invited or created administratively. The app client:

- Has no client secret because it runs in a browser.
- Uses Authorization Code with PKCE.
- Allows production callbacks under `https://invite-agent.10printiamcool.com` and explicit localhost callbacks for development.
- Uses short-lived access tokens and a longer-lived refresh token appropriate for a personal web application.

The backend derives the organiser identity from verified JWT claims. It never trusts an organiser ID supplied in the request body.

### 5.5 DynamoDB

DynamoDB stores current application state and immutable audit history. The MVP uses two tables so operational state and indefinitely growing history can be scaled, retained, and queried independently.

#### Application table

Table name pattern: `invite-agent-<environment>-app`.

| Entity | Partition key (`PK`) | Sort key (`SK`) | Important attributes |
|---|---|---|---|
| Poll metadata | `POLL#<pollId>` | `META` | ownerId, title, description, location, instructions, timeZone, status, version, linkGeneration, tokenHash, selectedDateId, previousSelectedDateId, frozenRanking, createdAt, updatedAt |
| Proposed date | `POLL#<pollId>` | `DATE#<dateId>` | kind (`DATE_ONLY` or `TIMED`), localDate or startAt, displayTimeZone, selectedUtcOffset, order, createdAt, updatedAt |
| Participant | `POLL#<pollId>` | `PARTICIPANT#<participantId>` | displayName, normalizedName, responses, createdAt, updatedAt |

Global secondary indexes:

- `GSI1`: `GSI1PK = ORGANISER#<organiserId>` plus `GSI1SK = POLL#<createdAt>#<pollId>`, used to list owned polls newest-created first. This replaces the earlier proposed update-ordered `OwnerIndex`; see section 5.6 for the actual repository and compatibility plan.
- `PublicTokenIndex`: `tokenHash` plus `linkGeneration`, used only to resolve an active public link to a poll. The index projection contains no participant data.

Participant `responses` are stored as a map from `dateId` to `YES` or `NO`. Poll reads use a single partition query to obtain metadata, dates, and participants.

The poll metadata `version` is a monotonically increasing integer shared by all mutable entities in the poll. It identifies the relative freshness of returned representations and supports audit ordering; it is not a client-supplied write precondition.

#### Audit table

Table name pattern: `invite-agent-<environment>-audit`.

| Key | Value |
|---|---|
| `PK` | `POLL#<pollId>` |
| `SK` | `REV#<zero-padded version>#<eventId>` |

Each immutable audit item includes:

- event ID and resulting poll version;
- action type and affected entity ID;
- actor type (`ORGANISER` or `PUBLIC_LINK`);
- organiser subject ID when authenticated;
- before and after domain values;
- server timestamp;
- correlation ID;
- for undo events, the original event ID and whether a newer value was replaced.

Public-link tokens, JWTs, cookies, credentials, and session identifiers are never written to the audit table.

Point-in-time recovery is enabled on both tables. Audit records have no TTL. Application data retention and account-deletion policies should be defined before production use.

### 5.6 My polls contract and storage handoff (S-043)

This section distinguishes inspected implementation from future API/storage work. S-043 delivers schemas and pure functions only; no endpoint, migration, deployment, or new lifecycle engine is introduced.

#### Inspected implementation

`packages/contracts/src/index.ts` uses strict, dependency-free `Schema.safeParse` validators. `backend/src/data/types.ts` stores `organiserId`, immutable `createdAt`, embedded `ProposedDate[]`, and lifecycle `draft | open | closed`. `DynamoPollRepository` writes metadata at `POLL#<id>/METADATA` with `GSI1PK = ORGANISER#<organiserId>` and `GSI1SK = POLL#<createdAt>#<id>` on create, details/location edits, publication, close/reopen, participant changes and undo. Dates are embedded, with date-only `localDate` or resolved timed `localDateTime/utcInstant/timeZone/utcOffset`. The actual public token lookup is a `PUBLIC_TOKEN#<hash>/CAPABILITY` point read, rather than the target-model PublicTokenIndex above.

`initializeTables` already creates `GSI1` with an ALL projection. No owned-list repository method exists yet. Participant rows and name locks are separate items; metadata has no participant count. The current `listParticipants` is a single database page and must not be reused as a complete dashboard count. `infra/src/index.ts` currently exports only the region: production stacks/authorizers/IAM are still a handoff, not provisioned code. The implemented organiser collection path is `/api/organiser/polls`; the broader `/api/v1` target design is not a reason to introduce a separate dashboard route family.

#### Authenticated request and response

The future route is `GET /api/organiser/polls`, alongside the existing collection POST. Parse URL query parameters into `OwnedPollListRequest` before application use: optional `filter` (`active | draft | open | closed`), `search` (at most 200 Unicode code points), `pageSize` (integer 1–50, default 25), and `cursor`. Reject unknown or duplicate parameters, invalid numeric encodings (accept canonical positive decimal integers only), invalid lifecycle filters, and malformed cursors with `VALIDATION_ERROR`/400; do not silently clamp. The shared schema consumes typed values, so the transport must explicitly convert the canonical numeric string. Default filter is active and default search is blank. Normalize search using `normalizeDashboardTitle` (NFC, trim, whitespace collapse, locale-independent lowercase). No owner ID is accepted in query/body/cursor as an authority. Active includes only draft and open.

`OwnedPollListResponse` is `{ items: OwnedPollSummary[], nextCursor?: string }` with at most 50 entries and no total. Each summary contains exactly `id`, `title`, `status`, canonical UTC ISO `createdAt` with milliseconds, `timeZone`, `proposedDates: ProposedDateInput[]`, and nonnegative integer `participantCount`. Preserve all proposed choices in saved order and timed UTC offsets, omitting internal resolution fields; permit zero proposed dates for incomplete drafts. The summary schema validates representations rather than reenacting publication readiness. Do not include organiser IDs, public links/tokens/hashes, participant names/availability, ranking, audit events, or mutation payloads. Creation dates are never synthesized from later activity. Missing/corrupt stored summary fields are server errors, never fabricated zero counts or creation times.

`OwnedPollListErrorResponse` matches the current HTTP envelope `{ error: { code, message, correlationId? } }`; known codes retain `API_ERROR_STATUS` and the existing handler's `INTERNAL_ERROR` maps to 500. Authenticate before accessing owner data: missing/unverified organiser identity is `UNAUTHENTICATED`/401. Existing individual poll access remains `FORBIDDEN`/403 for non-owners. Bad, altered, expired, cross-owner or different-query cursors use `VALIDATION_ERROR`/400 with no data. Preserve rate limiting as `RATE_LIMITED`/429. Use simulated identity only from the guarded local adapter; production derives the subject from verified Cognito JWT claims. Dashboard reads create no audit revisions.

#### Creation order, matching and bounded reads

Query only the verified owner's GSI1 partition with `ScanIndexForward: false`; do not Scan the table or sort an update-ordered first page. Canonical creation timestamps followed by poll ID give descending creation order and descending ordinal ID for equal instants. The pure comparator implements the same order. Search and lifecycle matching apply to every candidate across continuation pages, not just the initial DynamoDB page.

Future endpoint work evaluates at most 200 candidates per request, querying batches of at most 50 (and at most the remaining result capacity/budget so no matching candidate is lost through overflow). Strongly consistent metadata point reads, with bounded concurrency, recheck ownership and current title/status for each candidate because GSI propagation is eventual. Stale/deleted candidates are skipped. Stop at the requested match count, database exhaustion, or candidate budget; continue from the last evaluated candidate. A zero-item page may have nextCursor. Never claim exhaustive no-match until continuation ends. At most 200 metadata reads and 50 returned summaries occur per request, with no participant or audit hydration. Concurrent changes can affect membership between requests; refresh starts over, and consumers deduplicate IDs when appending. Creation ordering is stable but GSI publication is eventually consistent.

To meet those bounds, future storage work adds a transactional `participantCount` on poll metadata, initialized to zero, changed only by participant add/delete and their inverses, and preserved by rename/availability and lifecycle/detail edits. All existing metadata-write paths must preserve the field. A controlled pre-enable backfill counts all current participant rows across every database page, excluding name locks, with version-conditional writes/retries so concurrent mutations cannot lose counts. Existing polls already have the creation GSI keys; no key rewrite is needed locally. Do not enable the endpoint until counts are backfilled, writers maintain them, and canonical creation timestamps/index presence are verified. Never assume absent count means zero. This is a later story's compatibility requirement, not an S-043 migration.

#### Continuations and environment handoff

The opaque cursor wire form is `v1.<base64url payload>.<base64url HMAC-SHA256>` (unpadded; 43-character MAC; maximum 2048 characters). Shared validation checks only version/shape/length, never cryptographic trust. Future backend code signs and verifies the complete payload with an environment-specific secret, rejects noncanonical encoding, and binds version, verified organiser subject, normalized search, filter, pageSize, expiry (15 minutes), and the last evaluated creation-index key. Validate decoded keys belong to that owner's partition and are correctly shaped. Do not send the cursor to telemetry. Clients treat it as opaque; changing search/filter/page size restarts paging. Do not reuse the unsigned audit offset cursor for this route.

Local initialization and future production CDK must agree on GSI1 string keys/projection. If a deployed environment instead has the older OwnerIndex design, add the creation GSI and backfill its keys from immutable creation values, wait for ACTIVE and verify old data before enabling; retain the old index until its consumers are retired. Organiser IAM needs Query on the app table's GSI1 ARN and GetItem on metadata; no dashboard audit access or scan permission is needed. Future backfill tooling has separate scoped read/update permissions and never touches audit history. Production authorizer, query forwarding, cursor secret configuration and rotation (rotation invalidates old continuations), table/index verification, and count migration must be tested together in their delivery stories. No README operational change is needed until that work exists.

## 6. Domain Model and State Transitions

```text
                 publish
       ┌───────┐────────────▶┌──────┐
       │ DRAFT │             │ OPEN │
       └───────┘             └──┬───┘
                                │ select final date
                                │ and confirm
                                ▼
                            ┌────────┐
                            │ CLOSED │
                            └───┬────┘
                                │ reopen
                                └──────────────▶ OPEN
```

Server-side rules are authoritative:

- A draft must have a title, time zone, and at least two distinct valid dates before publication.
- Participant mutations are allowed only for an `OPEN` poll and a current public link.
- Closing is one atomic operation that selects a valid proposed date, stores a frozen ranking snapshot, changes status to `CLOSED`, and appends an audit event.
- Reopening changes status to `OPEN`, retains the previous selection as provisional, and appends an audit event.
- A newly closed poll replaces the provisional selection with the confirmed selection and captures a new frozen ranking.
- Link regeneration increments `linkGeneration`, stores a new token hash, and immediately invalidates the previous token.
- Participant display names are trimmed at their boundaries, limited to 100 Unicode code points, and compared for uniqueness using NFKC normalisation plus locale-independent case folding; internal whitespace is preserved.
- Location source is limited to 4,000 Unicode code points. The Markdown parser accepts paragraphs, line breaks, emphasis, strong emphasis, ordered and unordered lists, and `https:` links; it rejects raw HTML and unsafe link schemes, and the rendered result is sanitised.
- Date-only options retain their local ISO date independently of time-zone conversion. Timed options store a UTC instant, the poll's IANA time zone, and the organiser-selected UTC offset. Nonexistent local times are rejected; ambiguous local times require explicit offset selection.

## 7. Public-Link Design

The public URL has the form:

```text
https://invite-agent.10printiamcool.com/p/<opaque-token>
```

The token is generated from 192 bits of cryptographically secure randomness and encoded using Base64URL. Only a keyed hash of the token is stored. The raw token is returned once when the link is created or regenerated and is subsequently carried in the public URL.

The API accepts the token in a dedicated header sent by the SPA, not in the API path or query string. This reduces its exposure in API access logs. The public page still necessarily receives the token in its browser URL; the application therefore sets a restrictive referrer policy and must not load third-party scripts or resources that could receive the URL.

The public link is a bearer capability. The interface states clearly that anyone holding it can view and edit all responses while the poll is open.

## 8. API Design

All endpoints are versioned under `/api/v1`. JSON is used for requests and responses. Timestamps use ISO 8601 UTC values; the configured IANA time-zone identifier controls display.

### 8.1 Organiser endpoints

| Method and path | Purpose |
|---|---|
| `GET /organiser/polls` | List the signed-in organiser's polls |
| `POST /organiser/polls` | Create a draft poll |
| `GET /organiser/polls/{pollId}` | Read the full organiser view |
| `PATCH /organiser/polls/{pollId}` | Edit poll details |
| `POST /organiser/polls/{pollId}/dates` | Add a proposed date |
| `PATCH /organiser/polls/{pollId}/dates/{dateId}` | Edit or reorder a proposed date |
| `DELETE /organiser/polls/{pollId}/dates/{dateId}` | Remove a proposed date |
| `POST /organiser/polls/{pollId}/publish` | Validate and publish the poll |
| `POST /organiser/polls/{pollId}/link:regenerate` | Revoke the old link and issue a new one |
| `GET /organiser/polls/{pollId}/history` | Page through audit events newest first |
| `POST /organiser/polls/{pollId}/history/{eventId}:undo` | Apply a compensating mutation |
| `POST /organiser/polls/{pollId}/close` | Select a final date and close the poll |
| `POST /organiser/polls/{pollId}/reopen` | Reopen a closed poll |

Ownership is checked on every organiser request after JWT validation.

### 8.2 Public endpoints

| Method and path | Purpose |
|---|---|
| `GET /public/poll` | Resolve the supplied public token and return the public poll view |
| `POST /public/poll/participants` | Add a participant row |
| `PUT /public/poll/participants/{participantId}` | Replace a participant row |
| `DELETE /public/poll/participants/{participantId}` | Remove a participant row |

Public mutations require the active link token but no expected version. A public read returns:

- public poll metadata and lifecycle status;
- ordered proposed dates;
- participant names and availability values;
- Yes totals;
- live ranking when open, or the frozen ranking when closed;
- selected or provisional date information;
- the current version.

Audit history and organiser identity are not exposed through public endpoints.

### 8.3 Error contract

Errors use a consistent structure:

```json
{
  "error": {
    "code": "DUPLICATE_PARTICIPANT_NAME",
    "message": "A participant with that name already exists.",
    "correlationId": "...",
    "details": {}
  }
}
```

Expected statuses include `400` for validation, `401` for missing or invalid organiser authentication, `403` for failed ownership checks, `404` for missing resources or invalid public links, `409` for uniqueness conflicts such as a duplicate participant name, `410` for a revoked public link where disclosure is acceptable, `422` for invalid lifecycle transitions, and `429` for throttling. Concurrent edits do not produce a client-visible conflict response.

Production errors do not include stack traces or internal AWS details.

## 9. Writes, Concurrency, and Auditing

Every mutation is implemented as a DynamoDB transaction containing:

1. Condition checks for applicable lifecycle, ownership, active-link, and uniqueness rules.
2. The domain item insert, update, or delete.
3. A metadata update that increments the poll version and updates its timestamp.
4. An immutable audit item whose revision is the new version.

For participant creation, the transaction also prevents duplicate case-insensitive names. A small name-lock item can be used when needed:

```text
PK = POLL#<pollId>
SK = NAME#<normalizedName>
```

The lock points to the participant ID and is created, changed, or deleted in the same transaction as the participant. Normalisation trims surrounding whitespace and applies Unicode normalisation plus locale-independent case folding.

Clients never supply an expected version and never receive an edit-conflict warning. If concurrent transactions contend internally, the service re-reads the latest state and transparently retries the requested mutation with bounded retries. Of the successfully committed mutations, the last commit wins for overlapping values. Each response contains the latest server state known after that mutation, and clients replace their displayed state with it; polling or a later response may replace it again when a newer version is observed.

### 9.1 Undo

Undo is a new compensating mutation, never deletion of history. The backend:

1. Loads the selected audit event and current entity.
2. Determines the inverse operation from the event's before/after values.
3. Detects later events affecting the same entity or field.
4. Returns a warning preview when newer values would be overwritten.
5. Requires an explicit confirmation flag for a destructive compensation.
6. Applies the inverse in a transaction against the latest server state.
7. Appends an `UNDO` audit event referencing the original event.

If a later revision changed the affected value, the preview identifies that newer work and confirmation restores the selected event's `before` value, overwriting the newer value. Some events can become non-reversible because a later structural change makes the original state invalid. The API rejects such an undo atomically and reports it explicitly rather than partially applying it.

## 10. Ranking

The backend is the source of truth for ranking. For each proposed date it calculates the Yes total, then sorts by:

1. Yes total descending.
2. Original proposed-date order ascending.

It returns at most five entries. The dataset is small enough for calculation during a poll read and after a mutation; no separate analytics service is required.

While a poll is open, ranking is calculated from current participant responses. Closing stores the complete top-five result in `frozenRanking`. Closed reads return that snapshot even if historical data is later inspected. Reopening resumes live calculation; closing again replaces the snapshot.

## 11. Security

### 11.1 Controls

- CloudFront enforces HTTPS and adds Content Security Policy, HSTS, `X-Content-Type-Options`, frame restrictions, and a strict referrer policy.
- The S3 origin is private and accessible only through CloudFront.
- Cognito JWT signature, issuer, audience/client, token use, and expiry are validated by the API authorizer.
- Organiser ownership and lifecycle permissions are enforced in Lambda, never only in the SPA.
- Public tokens are high-entropy, revocable, and stored only as hashes.
- Lambda IAM roles grant access only to required table operations, indexes, and log groups.
- DynamoDB tables, S3 buckets, and log groups use encryption at rest.
- CloudWatch logs exclude authorization headers, raw public tokens, and full request bodies.
- User-provided text is rendered as text, not trusted HTML.
- Input length, count, and format limits are enforced server-side.
- API Gateway throttles public mutations; AWS WAF can be attached to CloudFront if internet abuse warrants the additional cost.

### 11.2 Privacy considerations

Participant names and availability are intentionally visible to every holder of the public link. The poll creation flow must explain this sharing model to the organiser, and the public page must repeat it before a participant submits data.

The architecture does not collect participant email addresses, accounts, IP addresses in audit data, or ownership tokens. Standard infrastructure access logs may contain network metadata and require a defined retention period.

## 12. Reliability and Performance

- DynamoDB on-demand capacity accommodates irregular traffic without capacity planning.
- Transactional writes keep current state and audit history consistent.
- Lambda functions run in multiple Availability Zones as managed by AWS.
- CloudFront caches static assets near users.
- API responses use compression where supported.
- Poll sizes are bounded, for example 50 proposed dates and 250 participants, to keep response, transaction, and browser rendering costs predictable. Final limits should be confirmed during implementation.
- DynamoDB point-in-time recovery protects against operational deletion or corruption.
- CloudFormation termination protection and resource removal policies protect production state.
- Idempotency keys are accepted for create and lifecycle commands so a client retry after a timeout does not duplicate an action.

For the MVP, synchronous transactional writes are preferred over an event-driven write model: users need immediate confirmation, poll-level traffic is modest, and the simpler consistency model directly supports audit ordering, transparent retry, and undo.

## 13. Observability

Each request receives or generates a correlation ID propagated through API responses and structured logs. Logs include route, status, latency, actor type, poll ID, resulting version, and error code, but exclude participant response bodies and security tokens.

CloudWatch dashboards and alarms cover:

- API Gateway 4xx, 5xx, latency, and throttling;
- Lambda errors, duration, throttles, concurrency, and iterator/DLQ failures if asynchronous work is added;
- DynamoDB throttling, transaction conflicts, and system errors;
- CloudFront error rate;
- Cognito sign-in failures at an aggregate level;
- synthetic health checks for the SPA and a lightweight API health route.

Production log retention is explicitly configured rather than left indefinite. Alarms notify an operator through an SNS topic and a configured subscription.

## 14. Repository Structure

The intended repository layout is:

```text
.
├── .docs/
│   ├── architecture.md
│   └── user-requirements.md
├── infra/                  # AWS CDK app and stacks
├── backend/                # Lambda handlers and shared domain code
│   ├── src/adapters/       # Lambda and local HTTP/authentication adapters
│   ├── src/functions/
│   ├── src/domain/
│   ├── src/data/
│   └── test/
├── frontend/               # React/Vite SPA
├── packages/
│   └── contracts/          # Shared API schemas and generated types
├── scripts/                # Build/deploy and local-development helpers (Start-DevStack.ps1, Stop-DevStack.ps1)
├── Deploy.ps1
├── compose.yaml            # DynamoDB Local for development and E2E tests
└── README.md
```

Shared contracts define API payload schemas, availability values, lifecycle states, and error codes. Backend validation remains authoritative even when the frontend imports the same schemas.

## 15. Infrastructure and Deployment

CDK defines separate stacks or nested constructs for:

- data tables;
- Cognito;
- Lambda and API Gateway;
- S3 and CloudFront;
- DNS, certificate, monitoring, and alarms.

Environments use explicit configuration rather than implicit account defaults. Development and production have separate resource names, tables, Cognito pools, distributions, and log groups.

### 15.1 Lambda ZIP build

Each Lambda entry point is bundled with `esbuild`:

```text
TypeScript source
      │
      ▼
esbuild bundle + minify + source map
      │
      ▼
small JavaScript deployment directory
      │
      ▼
CDK asset ZIP → Lambda
```

AWS SDK modules supplied by the runtime may be externalised when compatible; all other runtime dependencies are bundled. Native dependencies are avoided unless they can be reproducibly built for the Lambda architecture. Source maps are deployed and enabled for readable stack traces, while source content and secrets are excluded.

This removes Docker and ECR from the production build and deployment prerequisites. Docker may still be used as a development convenience to run DynamoDB Local; it is not involved in packaging or executing the Lambda functions.

### 15.2 Deployment sequence

1. Install dependencies from the lock file.
2. Run formatting, linting, unit tests, contract tests, and frontend tests.
3. Build frontend assets and Lambda ZIP bundles.
4. Run `cdk synth` and policy/security checks.
5. Deploy the CDK stacks for the target environment.
6. Upload versioned frontend assets and `index.html`.
7. Invalidate only mutable CloudFront paths such as `/index.html`.
8. Run smoke tests through `https://invite-agent.10printiamcool.com` in production.

CDK Lambda assets are content-addressed, so changed code produces a new Lambda version. Production functions use aliases, allowing a deployment to move the alias and roll back to the preceding version. Database changes must be backward-compatible during a deployment; destructive migrations require a separate reviewed process.

## 16. Local Development and Testing

The complete application must run on a developer workstation and in CI without deploying AWS resources. Local E2E tests exercise the browser, HTTP API, domain services, and DynamoDB persistence together. AWS-specific edge services such as CloudFront, API Gateway, Cognito, Route 53, and ACM are replaced by thin local adapters; their production configuration remains covered by infrastructure and deployed smoke tests.

### 16.1 Local topology

```text
┌──────────────────────┐       http://127.0.0.1:15173
│ Browser / Playwright │────────────────────────────────┐
└──────────────────────┘                                ▼
                                               ┌─────────────────┐
                                               │ Vite dev server │
                                               │ React SPA       │
                                               └────────┬────────┘
                                                        │ `/api/*` proxy
                                                        ▼
                                               ┌─────────────────┐
                                               │ Local Node.js   │
                                               │ HTTP adapter    │
                                               │ port 14000      │
                                               └────────┬────────┘
                                                        │
                                      ┌─────────────────┴──────────────┐
                                      ▼                                ▼
                             ┌──────────────────┐              ┌────────────────┐
                             │ Shared handlers │              │ Local auth     │
                             │ domain/services │              │ adapter        │
                             └────────┬─────────┘              └────────────────┘
                                      │ AWS SDK with endpoint override
                                      ▼
                             ┌──────────────────┐
                             │ DynamoDB Local   │
                             │ port 18000       │
                             └──────────────────┘
```

Vite proxies `/api/*` to the local backend, preserving the same-origin URL contract used by CloudFront in production. The frontend therefore uses relative API URLs in every environment. Public links use a configured base URL: `http://127.0.0.1:15173` locally and `https://invite-agent.10printiamcool.com` in production.

### 16.2 Portable application boundaries

Lambda handlers must remain thin transport adapters. They translate API Gateway events into the framework-neutral request context used by application services and translate service results back into HTTP responses. The local server performs the same translation for ordinary Node.js HTTP requests.

The following code is shared unchanged between local and AWS execution:

- request and response schemas;
- validation and error mapping;
- lifecycle, ranking, link, audit, and undo services;
- DynamoDB repositories and transactional write definitions;
- organiser ownership and public-link authorisation policies;
- structured logging fields and correlation-ID propagation.

Only composition-root concerns vary by environment: HTTP event parsing, verified organiser identity, resource names, DynamoDB endpoint, log sink, and public base URL. Business logic must not branch on whether it is running locally or in Lambda.

### 16.3 DynamoDB Local

`compose.yaml` runs DynamoDB Local, publishing its container port `8000` on host port `18000` (overridable with `DYNAMODB_PORT`). The backend selects it through `DYNAMODB_ENDPOINT=http://127.0.0.1:18000`; omitting this setting in deployed environments uses the regional AWS endpoint. Local table names are isolated from deployed names.

An idempotent initialisation command creates the application and audit tables, keys, and indexes exactly as defined by the production infrastructure. A reset command deletes only the explicitly named local tables and recreates them. E2E workers receive an isolated table-name suffix or run serially so test cases cannot leak state into one another.

The repository and concurrency integration tests run against DynamoDB Local rather than an in-memory substitute. This ensures that transactions, conditional expressions, transparent contention retries, last-update-wins behavior, index access patterns, and duplicate-name locks are exercised through the same AWS SDK operations as production.

### 16.4 Local authentication

Local execution uses an explicit development authentication adapter instead of requiring access to Cognito. When enabled, it maps a test-only request header or a Playwright test session to a deterministic organiser subject, such as `local-organiser-1`. This enables E2E coverage of organiser ownership and protected routes while keeping tests repeatable and offline.

The adapter is guarded in several ways:

- It is included only in the local server composition root, not imported by a Lambda entry point.
- The local server refuses to start with local authentication unless `APP_ENV=local` or `APP_ENV=test`.
- Production CDK configuration has no switch that can enable authentication bypass.
- Browser tests cover both an authenticated local organiser and rejected unauthenticated requests.

The local adapter verifies application authorisation behavior, but not Cognito itself. JWT-authorizer configuration is covered by CDK tests, with a small deployed smoke test validating the real Cognito sign-in path before a production release.

### 16.5 Configuration

Local configuration is supplied through a checked-in `.env.example` and an ignored `.env.local`. No AWS credentials are required for the default local stack. At minimum, the backend receives:

| Variable | Local value | Purpose |
|---|---|---|
| `APP_ENV` | `local` or `test` | Selects the permitted local composition root |
| `API_PORT` | `14000` | Local API listener |
| `AWS_REGION` | `eu-west-2` | Required by the AWS SDK, even with a local endpoint |
| `DYNAMODB_ENDPOINT` | `http://127.0.0.1:18000` | Selects DynamoDB Local |
| `APP_TABLE_NAME` | Test-specific local name | Current-state table |
| `AUDIT_TABLE_NAME` | Test-specific local name | Audit table |
| `PUBLIC_BASE_URL` | `http://127.0.0.1:15173` | Generated public links |
| `AUTH_MODE` | `local` | Enables only the local authentication adapter |
| `WEB_PORT` | `15173` | Vite dev server listener; also used to derive `PUBLIC_BASE_URL` |
| `DYNAMODB_PORT` | `18000` | Host port for DynamoDB Local; also used to derive `DYNAMODB_ENDPOINT` |

Dummy local AWS access-key values may be supplied to satisfy SDK credential resolution, but they must never be accepted as production credentials or committed as real secrets.

### 16.6 Stack lifecycle and deterministic data

The `scripts/` directory provides a one-command developer experience through npm scripts:

```powershell
npm run dev        # runs scripts/Start-DevStack.ps1
# application is available at http://127.0.0.1:15173
npm run dev:stop   # runs scripts/Stop-DevStack.ps1
```

`scripts/Start-DevStack.ps1`:

1. Validates Node.js, package installation, and the DynamoDB Local runtime.
2. Starts DynamoDB Local through Docker Compose.
3. Waits for its health check and initialises the two tables.
4. Starts the local API and waits for `/health`.
5. Starts Vite and waits for the application URL.
6. Records only the processes and containers it started so shutdown is scoped and recoverable.

`scripts/Stop-DevStack.ps1` stops those recorded processes and the project-scoped DynamoDB Local container. It does not delete developer data by default. A separate, explicit reset command recreates local tables.

Seed fixtures create deterministic draft, open, and closed polls with known IDs, versions, dates, participants, link tokens, rankings, and audit events. Seeding is idempotent and available only in local/test mode. Browser tests may request a fresh named fixture through a local-only test setup command before each scenario.

### 16.7 E2E and CI execution

Playwright drives the SPA through `http://127.0.0.1:15173`; tests do not call application services directly. The E2E suite covers:

- organiser sign-in behavior through the local auth adapter;
- draft creation, validation, date editing, publication, and public-link copying;
- adding, editing, and removing participant rows through the public page;
- Yes totals and ranking tie-breaks;
- controlled concurrent edits that prove the later successful update wins without a conflict warning and both clients converge on the latest server state;
- immutable history, ordinary undo, and confirmed undo over a newer value;
- final-date selection, frozen ranking, closing, reopening, and closing again;
- public-link regeneration and rejection of the old link;
- server-side rejection of closed-poll edits and unauthorised organiser actions.

The CI job uses the same orchestration and configuration model in headless mode:

1. Install locked dependencies and Playwright's browser runtime.
2. Start DynamoDB Local and initialise isolated test tables.
3. Start the local API and built or development frontend.
4. Wait on health endpoints rather than fixed sleep periods.
5. Run the Playwright suite.
6. Always collect browser traces, screenshots, API logs, and service logs on failure.
7. Stop processes and containers in an unconditional cleanup step.

The local suite is the primary functional release gate. It is complemented, not replaced, by deployed smoke tests for CloudFront routing, private S3 access, API Gateway integration, Lambda ZIP execution, Cognito, DNS, and TLS.

### 16.8 Testing layers

Testing layers include:

- Unit tests for validation, lifecycle transitions, ranking, normalisation, and undo inversion.
- Property tests for ranking tie-breaks and state-machine invariants.
- Repository integration tests against DynamoDB Local, especially transparent transaction retries, last-update-wins behavior, and name locks.
- API contract tests for organiser and public routes.
- Browser tests for poll creation, public collaboration, concurrent last-update-wins behavior, close/reopen, link rotation, and undo warnings.
- CDK snapshot/assertion tests for private S3 access, authorisers, IAM boundaries, alarms, and ZIP-based Lambda resources.
- Production smoke tests using a disposable poll.

## 17. Key Decisions and Trade-offs

| Decision | Rationale | Trade-off |
|---|---|---|
| CloudFront single origin with `/api/*` routing | Simple browser security model and clean vanity URL | CloudFront behavior configuration must preserve API methods and headers |
| Lambda ZIP deployment | Fast, simple deployment for TypeScript with no ECR or Docker requirement | Unsuitable for unusually large or native-heavy dependencies |
| DynamoDB transactions, transparent contention retry, and poll-wide version | Implement last-update-wins without user-visible conflict warnings while pairing every mutation with its audit event and letting clients identify fresher state | Overlapping edits may overwrite an earlier accepted value by design; clients must refresh from every mutation response and newer observed state |
| Separate current-state and audit tables | Independent retention, permissions, and query patterns | Two tables participate in each transactional write |
| Opaque bearer public link | Meets account-free collaboration requirement | Link disclosure grants access until rotation |
| Store frozen ranking on close | Directly preserves the required closed-state result | Duplicates derived data and requires atomic close logic |
| Compensating undo events | Preserves immutable history | Undo logic must handle later dependent changes explicitly |
| Shared core with local infrastructure adapters | Enables representative offline E2E tests without maintaining a second implementation | Cognito, CloudFront, API Gateway, DNS, and TLS still require infrastructure tests and deployed smoke coverage |

## 18. Deferred Decisions and Future Enhancements

The following are outside the MVP architecture but have clear extension points:

- Email invitations or calendar-file generation.
- Notifications when a poll changes or closes.
- Fine-grained participant ownership and authenticated participants.
- Real-time updates through WebSocket/AppSync; the MVP uses refresh after mutations and optional polling.
- Audit export to S3 with retention governance.
- Multi-region disaster recovery.
- AWS WAF managed rules if public traffic or abuse justifies the cost.
- Accessibility and performance budgets enforced in CI.

Before implementation begins, the team should confirm maximum poll sizes, organiser onboarding policy, data retention/deletion policy, alarm destinations, and whether the existing Route 53 hosted zone is managed by the same AWS account as the application.
