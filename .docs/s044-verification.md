# S-044 verification — 4 October 2026

Delivered T-102 through T-107 in their requested order. S-045 and later stories were not started.

## Implementation

Authenticated `GET /api/organiser/polls` returns safe owned summaries with lifecycle/title predicates and immutable creation ordering. Reads traverse the owner GSI1 partition, strongly recheck current metadata, stop at 200 candidates / 50 results, and return signed, query/owner-bound 15-minute continuations. Empty continuation pages remain valid. List requests never hydrate participants/audit, write data, or perform scans. Responses use private/no-store caching.

Participant counts are maintained in the existing mutation transactions, including undo. Local pre-listener maintenance explicitly migrates legacy counts across all participant pages with version/document guards and validates creation-index readiness. The migration preserves versions and audit history; legacy writers cannot overwrite a concurrently migrated count.

Local HTTP and production HTTP API v2 adapter factories share the service. Production identity comes exclusively from the configured JWT authorizer's subject. The public factory cannot serve organiser routes.

## Executed checks

- `npm run check`: passed; format, lint, TypeScript build/typecheck, production import boundaries, **110 foundation tests**, and security checks.
- `node --test test/integration/*.test.mjs`: **55 passed / 1 environment-blocked** on the first full run. The blocked existing all-local cleanup test could not access Docker from the sandbox; it did not fail an application assertion.
- `node --test test/integration/clear-all-local-data.test.mjs` with Docker access: passed, **5 tests including its four nested cases**, using its own disposable in-memory container. No outstanding skipped or failing regression remains from that run.
- New large repository matrix passed both focused and full-suite runs: two owners, all filters, Unicode title normalization, stable continuation without omissions/duplicates, sparse zero-match continuation, budget limits and unchanged complete table snapshots.
- Focused participant/legacy tests passed after extending coverage to rename/availability count preservation and idempotent startup migration.
- Final focused API/publication regression: **5 passed**, including concurrent publication, verified-claims transport comparison and actual local HTTP authorization/query/cursor tests.
- Fixture isolation and forced dashboard assertion-failure teardown passed. Every integration fixture uses the existing owned-table harness; shared development data was not seeded.
- `git diff --check`: passed. Final kanban validation: no errors or warnings; T-102–T-107 and computed S-044 are done.

The parallel integration run emitted DynamoDB Local request-time warnings under contention; the only failure was the Docker sandbox restriction resolved above. Ignored local run logs are `.devstack/s044-integration.log` and `.devstack/s044-check.log`.

## Changed files

- Application/data: `backend/src/application/poll-service.ts`, `backend/src/data/types.ts`, `backend/src/data/dynamodb-poll-repository.ts`.
- HTTP/security: `backend/src/http/shared-handler.ts`, `backend/src/http/owned-poll-query.ts`, `backend/src/security/owned-poll-cursor.ts`.
- Local adapters: `backend/src/adapters/local/composition.ts`, `config.ts`, `node-server.ts`, `dashboard-migration.ts`.
- Lambda factories: `backend/src/functions/http-api.ts`, `backend/src/functions/index.ts`.
- Tests: `test/foundation/my-polls-cursor.test.mjs`, `my-polls-persistence.test.mjs`; `test/integration/my-polls-api.test.mjs`, `my-polls-fixture.test.mjs`, `my-polls-repository.test.mjs`, `integration-cleanup.test.mjs`; `test/support/my-polls-fixture.mjs`, `integration-failure-child.mjs`.
- Documentation: `README.md`, `.docs/architecture.md`, `.docs/user-requirements-my-polls.md`, `.docs/acceptance-use-cases-my-polls.md`, this evidence record.
- Kanban MCP mutations: the six T-102–T-107 entity files, generated `.worktracker/graphs/{dependencies,E-012}.mmd` and `.worktracker/index/{BLOCKED,E-012,INDEX,READY}.md`.

## Boundaries

No AWS deployment, Cognito sign-in, production migration or IAM synthesis was performed. Infrastructure remains a placeholder. Architecture section 5.6 specifies pending handler composition, protected GET route/authorizer mapping, raw-query forwarding, stable secret configuration, GSI1 Query/metadata GetItem permissions, a separate migration role and pre-enable verification. Browser dashboard work and browser acceptance remain later stories. Live pagination is eventually consistent and is not a snapshot.
