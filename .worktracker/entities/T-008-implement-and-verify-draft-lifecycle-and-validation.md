---
id: T-008
type: task
title: Implement and verify draft lifecycle and validation
parent: S-004
status: todo
dependsOn: [T-007]
estimate: 2
tags: [green, implementation, S-004]
archived: false
created: 2026-09-27T18:08:39.750Z
updated: 2026-09-27T18:19:37.845Z
---
Implementation scope:
Implement draft aggregate, lifecycle rules, validation schemas, stable errors, and publication-readiness calculation.

Acceptance criteria:
- Blank title, bad zone, insufficient/duplicate choices, and invalid transitions are rejected; valid optional-empty drafts persist; all tests pass.
- Every acceptance criterion in parent story S-004 is satisfied without weakening or deleting the red tests.
- Targeted tests and the relevant regression suite are green.
- Static analysis, security checks, and accessibility checks applicable to the slice pass.
- Changed files, exact verification commands, and results are attached as evidence.