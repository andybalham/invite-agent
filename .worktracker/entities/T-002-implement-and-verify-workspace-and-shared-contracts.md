---
id: T-002
type: task
title: Implement and verify workspace and shared contracts
parent: S-001
status: todo
dependsOn: [T-001]
estimate: 2
tags: [green, implementation, S-001]
archived: false
created: 2026-09-27T18:08:39.315Z
updated: 2026-09-27T18:19:37.339Z
---
Implementation scope:
Create the package layout, locked root commands, shared schemas/types, and production/local import boundaries.

Acceptance criteria:
- Root format, lint, typecheck, unit, and boundary commands are green; shared contracts cover lifecycle, Yes/No, DTOs, and error codes.
- Every acceptance criterion in parent story S-001 is satisfied without weakening or deleting the red tests.
- Targeted tests and the relevant regression suite are green.
- Static analysis, security checks, and accessibility checks applicable to the slice pass.
- Changed files, exact verification commands, and results are attached as evidence.