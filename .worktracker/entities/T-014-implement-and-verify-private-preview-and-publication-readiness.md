---
id: T-014
type: task
title: Implement and verify private preview and publication readiness
parent: S-007
status: todo
dependsOn: [T-013]
estimate: 2
tags: [green, implementation, S-007]
archived: false
created: 2026-09-27T18:08:40.163Z
updated: 2026-09-27T18:19:38.012Z
---
Implementation scope:
Implement participant-like Draft preview, non-editable controls, blocking-field feedback, and server-side publish readiness enforcement.

Acceptance criteria:
- Preview remains private/non-editable; invalid publish attempts issue no link or audit mutation; valid readiness is visible; tests pass.
- Every acceptance criterion in parent story S-007 is satisfied without weakening or deleting the red tests.
- Targeted tests and the relevant regression suite are green.
- Static analysis, security checks, and accessibility checks applicable to the slice pass.
- Changed files, exact verification commands, and results are attached as evidence.