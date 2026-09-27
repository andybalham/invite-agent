---
id: T-004
type: task
title: "Implement and verify local DynamoDB, shared services, and guarded auth"
parent: S-002
status: done
dependsOn: [T-003]
estimate: 2
tags: [green, implementation, S-002]
archived: false
created: 2026-09-27T18:08:39.451Z
updated: 2026-09-27T18:58:57.030Z
---
Implementation scope:
Implement table initialization, repositories, shared application services, local HTTP translation, configuration, and local-only auth guards.

Acceptance criteria:
- Tests run without AWS credentials; local/test auth works deterministically; production composition cannot import or enable the bypass.
- Every acceptance criterion in parent story S-002 is satisfied without weakening or deleting the red tests.
- Targeted tests and the relevant regression suite are green.
- Static analysis, security checks, and accessibility checks applicable to the slice pass.
- Changed files, exact verification commands, and results are attached as evidence.

Evidence:
- Files: `compose.yaml`, `.env.example`, `backend/src/data/*`, `backend/src/application/*`, `backend/src/http/*`, `backend/src/adapters/local/*`, `scripts/initialize-local-tables.mjs`, `test/integration/*`.
- `npm run test:integration`: 4/4 passed against DynamoDB Local, including actual Node HTTP translation, deterministic isolated tables, shared validation/auth/persistence/audit/error mapping, and auth guards.
- `npm run check`: formatting, lint, typecheck, 12 foundation/boundary tests, and security check passed.
- `npm audit --audit-level=high`: 0 vulnerabilities.
- `npm run tables:init` twice: both succeeded for `invite-agent-local-app` and `invite-agent-local-audit`, proving idempotence.
- No AWS credentials were used; the endpoint-scoped client supplies deterministic dummy credentials only for DynamoDB Local.