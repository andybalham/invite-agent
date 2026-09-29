---
id: T-041
type: task
title: Implement and verify warned and structurally invalid undo
parent: S-019
status: done
dependsOn: [T-040]
estimate: 2
tags: [green, implementation, S-019]
archived: false
created: 2026-09-27T18:08:42.002Z
updated: 2026-09-29T18:26:59.686Z
---
Implementation scope:
Implement later-change detection, risk preview, explicit confirmation, overwrite-to-before semantics, and atomic structural rejection.

Acceptance criteria:
- Cancel is a no-op; confirmed overwrite is exact/audited; invalid undo makes no partial change or event; tests pass.
- Every acceptance criterion in parent story S-019 is satisfied without weakening or deleting the red tests.
- Targeted tests and the relevant regression suite are green.
- Static analysis, security checks, and accessibility checks applicable to the slice pass.
- Changed files, exact verification commands, and results are attached as evidence.