---
id: T-051
type: task
title: Implement and verify reopen and close-again lifecycle
parent: S-024
status: todo
dependsOn: [T-050]
estimate: 2
tags: [green, implementation, S-024]
archived: false
created: 2026-09-27T18:08:42.676Z
updated: 2026-09-27T18:19:39.149Z
---
Implementation scope:
Implement confirmation UI and atomic reopen, provisional selection, live ranking restoration, later same/different close, and history rendering.

Acceptance criteria:
- Cancel is a no-op; reopen and each close have separate required events; editability/ranking switch correctly; full journey passes.
- Every acceptance criterion in parent story S-024 is satisfied without weakening or deleting the red tests.
- Targeted tests and the relevant regression suite are green.
- Static analysis, security checks, and accessibility checks applicable to the slice pass.
- Changed files, exact verification commands, and results are attached as evidence.