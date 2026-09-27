---
id: T-033
type: task
title: Implement and verify deterministic ranking algorithm
parent: S-015
status: todo
dependsOn: [T-032]
estimate: 2
tags: [green, implementation, S-015]
archived: false
created: 2026-09-27T18:08:41.469Z
updated: 2026-09-27T18:19:38.490Z
---
Implementation scope:
Implement backend ranking by Yes descending then original choice order, capped at five.

Acceptance criteria:
- No totals and participant order have no effect; stable ties/limits are deterministic; all property tests pass.
- Every acceptance criterion in parent story S-015 is satisfied without weakening or deleting the red tests.
- Targeted tests and the relevant regression suite are green.
- Static analysis, security checks, and accessibility checks applicable to the slice pass.
- Changed files, exact verification commands, and results are attached as evidence.