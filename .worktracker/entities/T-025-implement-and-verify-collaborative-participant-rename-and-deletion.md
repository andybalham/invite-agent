---
id: T-025
type: task
title: Implement and verify collaborative participant rename and deletion
parent: S-012
status: todo
dependsOn: [T-024]
estimate: 2
tags: [green, implementation, S-012]
archived: false
created: 2026-09-27T18:08:40.949Z
updated: 2026-09-27T18:08:40.949Z
---
Implementation scope:
Implement atomic normalized-name lock changes, exact display-name delete confirmation, derived-total refresh, audit events, and row actions.

Acceptance criteria:
- Any current link holder can rename/delete any row; invalid confirmation/duplicate rename change nothing; successful actions autosave and tests pass.
- Every acceptance criterion in parent story S-012 is satisfied without weakening or deleting the red tests.
- Targeted tests and the relevant regression suite are green.
- Static analysis, security checks, and accessibility checks applicable to the slice pass.
- Changed files, exact verification commands, and results are attached as evidence.