---
id: T-010
type: task
title: Implement and verify draft details and safe location Markdown
parent: S-005
status: done
dependsOn: [T-009]
estimate: 2
tags: [green, implementation, S-005]
archived: false
created: 2026-09-27T18:08:39.882Z
updated: 2026-09-28T18:13:08.922Z
---
Implementation scope:
Implement owner-only draft create/edit, 4,000-code-point validation, Markdown allow-list, HTTPS-link enforcement, sanitisation, persistence, and UI.

Acceptance criteria:
- Valid plain text/Markdown round-trips; hostile/excessive input preserves attempted input but changes no stored/rendered value or history; tests pass.
- Every acceptance criterion in parent story S-005 is satisfied without weakening or deleting the red tests.
- Targeted tests and the relevant regression suite are green.
- Static analysis, security checks, and accessibility checks applicable to the slice pass.
- Changed files, exact verification commands, and results are attached as evidence.