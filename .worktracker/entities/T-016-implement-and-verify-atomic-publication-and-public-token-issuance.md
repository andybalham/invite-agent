---
id: T-016
type: task
title: Implement and verify atomic publication and public-token issuance
parent: S-008
status: done
dependsOn: [T-015]
estimate: 2
tags: [green, implementation, S-008]
archived: false
created: 2026-09-27T18:08:40.305Z
updated: 2026-09-28T19:37:21.987Z
---
Implementation scope:
Implement publish transaction, 192-bit Base64URL generation, keyed hashing, raw-token handling, link construction/copy support, and audit event.

Acceptance criteria:
- Only valid Drafts publish; raw tokens are never stored/logged; token uniqueness/format and one-event atomicity are proven; tests pass.
- Every acceptance criterion in parent story S-008 is satisfied without weakening or deleting the red tests.
- Targeted tests and the relevant regression suite are green.
- Static analysis, security checks, and accessibility checks applicable to the slice pass.
- Changed files, exact verification commands, and results are attached as evidence.

Evidence (2026-09-28):
- Implemented backend/src/security/public-token.ts; atomic repository publication; service/API publication; token-hash lookup; Share screen and copy interaction.
- Verification: node --test test/foundation/publication-security.test.mjs — 1/1 passed.
- Verification: npm run test:integration with the managed local stack — 8/8 passed, including simultaneous publication yielding one 200, one stable 409, and exactly one publication audit event.
- Verification: npm run check — format, lint, typecheck, 33 foundation tests, production boundaries, and security checks passed.
- Raw capabilities are returned only in publicUrl, redacted from browser API diagnostics, and absent from poll documents and audit records.