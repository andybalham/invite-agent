---
id: T-049
type: task
title: Implement and verify location maintenance across lifecycle states
parent: S-023
status: todo
dependsOn: [T-048]
estimate: 2
tags: [green, implementation, S-023]
archived: false
created: 2026-09-27T18:08:42.515Z
updated: 2026-09-27T18:19:39.099Z
---
Implementation scope:
Allow owner location set/edit/clear in Draft/Open/Closed using shared sanitisation, immediate projections, and audit; enforce ownership.

Acceptance criteria:
- Lifecycle state never changes; each success has one before/after event; invalid/unauthorised attempts are no-ops; all matrix tests pass.
- Every acceptance criterion in parent story S-023 is satisfied without weakening or deleting the red tests.
- Targeted tests and the relevant regression suite are green.
- Static analysis, security checks, and accessibility checks applicable to the slice pass.
- Changed files, exact verification commands, and results are attached as evidence.