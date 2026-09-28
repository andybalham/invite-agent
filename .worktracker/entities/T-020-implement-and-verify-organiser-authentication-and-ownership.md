---
id: T-020
type: task
title: Implement and verify organiser authentication and ownership
parent: S-010
status: done
dependsOn: [T-019]
estimate: 2
tags: [green, implementation, S-010]
archived: false
created: 2026-09-27T18:08:40.605Z
updated: 2026-09-28T19:38:59.438Z
---
Implementation scope:
Implement identity extraction, owner policy, consistent 401/403 mapping, and protection on every organiser handler.

Acceptance criteria:
- Every organiser route rejects missing identity, non-owner, and public-token-only callers without data/audit changes; production has no auth bypass; tests pass.
- Every acceptance criterion in parent story S-010 is satisfied without weakening or deleting the red tests.
- Targeted tests and the relevant regression suite are green.
- Static analysis, security checks, and accessibility checks applicable to the slice pass.
- Changed files, exact verification commands, and results are attached as evidence.

Evidence (2026-09-28):
- Verified identity is extracted at the shared HTTP boundary for every organiser route; ownership remains enforced in PollService; body-supplied organiserId/ownerId fields are discarded.
- Verification: npm run test:integration — 8/8 passed, including the complete organiser route matrix and zero mutation/audit effects for rejected requests.
- Verification: npm run check — format, lint, typecheck, 33 foundation tests, production-boundary checks, and security checks passed.
- Verification: npm run test:e2e — 14 passed, 1 intentionally skipped diagnostics fixture.
- Production boundary and composition tests prove the local authentication adapter cannot be composed for production.