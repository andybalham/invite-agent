---
id: T-020
type: task
title: Implement and verify organiser authentication and ownership
parent: S-010
status: todo
dependsOn: [T-019]
estimate: 2
tags: [green, implementation, S-010]
archived: false
created: 2026-09-27T18:08:40.605Z
updated: 2026-09-27T18:19:38.713Z
---
Implementation scope:
Implement identity extraction, owner policy, consistent 401/403 mapping, and protection on every organiser handler.

Acceptance criteria:
- Every organiser route rejects missing identity, non-owner, and public-token-only callers without data/audit changes; production has no auth bypass; tests pass.
- Every acceptance criterion in parent story S-010 is satisfied without weakening or deleting the red tests.
- Targeted tests and the relevant regression suite are green.
- Static analysis, security checks, and accessibility checks applicable to the slice pass.
- Changed files, exact verification commands, and results are attached as evidence.