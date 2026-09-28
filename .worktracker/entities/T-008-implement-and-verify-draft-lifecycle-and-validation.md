---
id: T-008
type: task
title: Implement and verify draft lifecycle and validation
parent: S-004
status: done
dependsOn: [T-007]
estimate: 2
tags: [green, implementation, S-004]
archived: false
created: 2026-09-27T18:08:39.750Z
updated: 2026-09-28T17:54:06.804Z
---
Implementation scope:
Implement draft aggregate, lifecycle rules, validation schemas, stable errors, and publication-readiness calculation.

Acceptance criteria:
- Blank title, bad zone, insufficient/duplicate choices, and invalid transitions are rejected; valid optional-empty drafts persist; all tests pass.
- Every acceptance criterion in parent story S-004 is satisfied without weakening or deleting the red tests.
- Targeted tests and the relevant regression suite are green.
- Static analysis, security checks, and accessibility checks applicable to the slice pass.
- Changed files, exact verification commands, and results are attached as evidence.

Evidence:
- Implemented stable draft/publication validation and lifecycle transition rules in backend/src/domain/draft-poll.ts.
- Extended shared contracts for editable drafts, optional description/instructions, IANA time-zone validation, and structurally valid date/date-time choices.
- Preserved optional draft fields in backend/src/application/poll-service.ts responses and persistence.
- Added/updated tests in test/foundation/draft-lifecycle.test.mjs and test/foundation/backend-validation.test.mjs.
- Targeted command: node --test test/foundation/draft-lifecycle.test.mjs test/foundation/backend-validation.test.mjs — 9 passed, 0 failed.
- Full command: npm run check — formatting, lint, typecheck, 22 tests, production boundaries, and security checks passed.