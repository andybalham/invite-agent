---
id: T-043
type: task
title: Implement and verify audit and undo authorization
parent: S-020
status: todo
dependsOn: [T-042]
estimate: 2
tags: [green, implementation, S-020]
archived: false
created: 2026-09-27T18:08:42.126Z
updated: 2026-09-27T18:19:38.940Z
---
Implementation scope:
Apply authentication/ownership policies and non-disclosing error mapping to history, preview, and execution endpoints/UI.

Acceptance criteria:
- Link holders and non-owners cannot observe event content or mutate state/history; 401/403 matrix passes.
- Every acceptance criterion in parent story S-020 is satisfied without weakening or deleting the red tests.
- Targeted tests and the relevant regression suite are green.
- Static analysis, security checks, and accessibility checks applicable to the slice pass.
- Changed files, exact verification commands, and results are attached as evidence.