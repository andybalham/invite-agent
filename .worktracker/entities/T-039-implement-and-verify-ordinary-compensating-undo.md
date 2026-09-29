---
id: T-039
type: task
title: Implement and verify ordinary compensating undo
parent: S-018
status: done
dependsOn: [T-038]
estimate: 2
tags: [green, implementation, S-018]
archived: false
created: 2026-09-27T18:08:41.872Z
updated: 2026-09-29T18:19:56.748Z
---
Implementation scope:
Implement reversible-event preview/execution, derived-value recalculation, original-event preservation, and linked UNDO append.

Acceptance criteria:
- Isolated update/add/delete inversions restore exact prior state and append one event; totals/ranking refresh; tests pass.
- Every acceptance criterion in parent story S-018 is satisfied without weakening or deleting the red tests.
- Targeted tests and the relevant regression suite are green.
- Static analysis, security checks, and accessibility checks applicable to the slice pass.
- Changed files, exact verification commands, and results are attached as evidence.