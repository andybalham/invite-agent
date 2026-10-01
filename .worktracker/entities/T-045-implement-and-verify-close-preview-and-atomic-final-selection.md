---
id: T-045
type: task
title: Implement and verify close preview and atomic final selection
parent: S-021
status: done
dependsOn: [T-044]
estimate: 2
tags: [green, implementation, S-021]
archived: false
created: 2026-09-27T18:08:42.252Z
updated: 2026-10-01T17:48:04.270Z
---
Implementation scope:
Implement close preview plus one transaction for selected date, Closed status, frozen ranking, and combined audit event.

Acceptance criteria:
- Cancel is a no-op; confirmation is all-or-nothing and exactly one event; visible Yes/No lists and warning are correct; tests pass.
- Every acceptance criterion in parent story S-021 is satisfied without weakening or deleting the red tests.
- Targeted tests and the relevant regression suite are green.
- Static analysis, security checks, and accessibility checks applicable to the slice pass.
- Changed files, exact verification commands, and results are attached as evidence.