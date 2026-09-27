---
id: T-012
type: task
title: Implement and verify ordered choices and DST-safe date handling
parent: S-006
status: todo
dependsOn: [T-011]
estimate: 2
tags: [green, implementation, S-006]
archived: false
created: 2026-09-27T18:08:40.017Z
updated: 2026-09-27T18:19:37.954Z
---
Implementation scope:
Implement date-only/timed representations, UTC/IANA/offset conversion, duplicate detection, ordering mutations, DST gap rejection, and fold selection UI.

Acceptance criteria:
- Add/edit/reorder/remove work in Draft; DST and duplicate cases behave exactly as specified; persisted values render in the poll zone; tests pass.
- Every acceptance criterion in parent story S-006 is satisfied without weakening or deleting the red tests.
- Targeted tests and the relevant regression suite are green.
- Static analysis, security checks, and accessibility checks applicable to the slice pass.
- Changed files, exact verification commands, and results are attached as evidence.