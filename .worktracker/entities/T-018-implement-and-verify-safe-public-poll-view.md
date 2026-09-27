---
id: T-018
type: task
title: Implement and verify safe public poll view
parent: S-009
status: todo
dependsOn: [T-017]
estimate: 2
tags: [green, implementation, S-009]
archived: false
created: 2026-09-27T18:08:40.463Z
updated: 2026-09-27T18:19:38.172Z
---
Implementation scope:
Implement current-token resolution, response projection, sanitised public rendering, collaborative notice, and 404/410 link handling.

Acceptance criteria:
- Fresh unauthenticated access works; drafts and organiser/audit data remain private; unknown/revoked cases are non-sensitive and accessible; tests pass.
- Every acceptance criterion in parent story S-009 is satisfied without weakening or deleting the red tests.
- Targeted tests and the relevant regression suite are green.
- Static analysis, security checks, and accessibility checks applicable to the slice pass.
- Changed files, exact verification commands, and results are attached as evidence.