---
id: T-006
type: task
title: Implement and verify one-command local stack and browser harness
parent: S-003
status: todo
dependsOn: [T-005]
estimate: 2
tags: [green, implementation, S-003]
archived: false
created: 2026-09-27T18:08:39.608Z
updated: 2026-09-27T18:19:37.711Z
---
Implementation scope:
Implement readiness-based start/stop scripts, Vite shell, health surface, isolated fixtures, CI cleanup, and failure artifact capture.

Acceptance criteria:
- One command starts a healthy browser app; stop is scoped; headless CI passes and retains diagnostics on intentional failure.
- Every acceptance criterion in parent story S-003 is satisfied without weakening or deleting the red tests.
- Targeted tests and the relevant regression suite are green.
- Static analysis, security checks, and accessibility checks applicable to the slice pass.
- Changed files, exact verification commands, and results are attached as evidence.