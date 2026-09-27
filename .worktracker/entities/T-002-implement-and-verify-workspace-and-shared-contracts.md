---
id: T-002
type: task
title: Implement and verify workspace and shared contracts
parent: S-001
status: done
dependsOn: [T-001]
estimate: 2
tags: [green, implementation, S-001]
archived: false
created: 2026-09-27T18:08:39.315Z
updated: 2026-09-27T18:44:23.040Z
---
Implementation scope:
Create the package layout, locked root commands, shared schemas/types, and production/local import boundaries.

Acceptance criteria:
- Root format, lint, typecheck, unit, and boundary commands are green; shared contracts cover lifecycle, Yes/No, DTOs, and error codes.
- Every acceptance criterion in parent story S-001 is satisfied without weakening or deleting the red tests.
- Targeted tests and the relevant regression suite are green.
- Static analysis, security checks, and accessibility checks applicable to the slice pass.
- Changed files, exact verification commands, and results are attached as evidence.

Implementation evidence (2026-09-27):
- References: S-001; Architecture §§14, 16.2, and 16.8; user requirements §12 stable API errors.
- Created locked npm workspaces for frontend, backend, infra, contracts, scripts, and tests with strict TypeScript project references.
- Implemented dependency-free shared schemas/types for lifecycle state, Yes/No availability, create-poll requests, public-poll responses, and stable API error codes/statuses.
- Added backend-authoritative request validation and tests proving valid input is accepted and invalid/spoofed input is rejected.
- Added a reusable production import-boundary scan that rejects local-only adapter imports, plus isolated positive and negative fixtures.
- Added root format, lint, typecheck, build, unit, boundary, security, aggregate test, and full check commands.
- Exact full command: & 'C:\nvm4w-monteith\nodejs\npm.cmd' run check
- Full result: format, lint, strict TypeScript build/typecheck, real production boundary scan, 12/12 tests, and secret scan passed.
- Exact unit command: & 'C:\nvm4w-monteith\nodejs\npm.cmd' run test:unit
- Unit result: 7/7 contract and backend-validation tests passed.
- Exact boundary command: & 'C:\nvm4w-monteith\nodejs\npm.cmd' run test:boundaries
- Boundary result: production tree scan passed and 2/2 isolated boundary tests passed.
- Exact dependency audit: & 'C:\nvm4w-monteith\nodejs\npm.cmd' audit --audit-level=high
- Dependency audit result: 0 vulnerabilities.
- Exact whitespace check: git diff --check
- Whitespace result: passed.
- Accessibility: not applicable to this foundation slice; no rendered UI was introduced.
- Main changed files: package.json, package-lock.json, .gitignore, tsconfig.json, tsconfig.base.json; workspace package manifests/configuration under frontend/, backend/, infra/, packages/contracts/, scripts/, and test/; contract implementation in packages/contracts/src/index.ts; authoritative backend validator in backend/src/domain/validate-create-poll-request.ts; boundary/format/lint/security checks in scripts/; backend-validation test in test/foundation/backend-validation.test.mjs.
- The inherited T-001 tests were not weakened or deleted.