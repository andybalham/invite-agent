---
id: T-018
type: task
title: Implement and verify safe public poll view
parent: S-009
status: done
dependsOn: [T-017]
estimate: 2
tags: [green, implementation, S-009]
archived: false
created: 2026-09-27T18:08:40.463Z
updated: 2026-09-28T19:38:49.673Z
---
Implementation scope:
Implement current-token resolution, response projection, sanitised public rendering, collaborative notice, and 404/410 link handling.

Acceptance criteria:
- Fresh unauthenticated access works; drafts and organiser/audit data remain private; unknown/revoked cases are non-sensitive and accessible; tests pass.
- Every acceptance criterion in parent story S-009 is satisfied without weakening or deleting the red tests.
- Targeted tests and the relevant regression suite are green.
- Static analysis, security checks, and accessibility checks applicable to the slice pass.
- Changed files, exact verification commands, and results are attached as evidence.

Evidence (2026-09-28):
- Implemented public capability lookup/projection, active/revoked resolution, safe location rendering, ordered date headers, collaboration notice, and accessible invalid-link UI.
- Verification: npm run test:e2e -- public-poll.spec.ts under the managed local stack — 3/3 passed, covering publish/copy, fresh unauthenticated access, and invalid-link UI.
- Verification: npm run test:integration — 8/8 passed, including 404 unknown, 410 revoked, privacy projection, concurrency, and no raw-token persistence.
- Verification: npm run check — format, lint, typecheck, 33 foundation tests, production-boundary checks, and security checks passed.