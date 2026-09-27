---
id: T-037
type: task
title: Implement and verify immutable audit persistence and history view
parent: S-017
status: todo
dependsOn: [T-036]
estimate: 2
tags: [green, implementation, S-017]
archived: false
created: 2026-09-27T18:08:41.732Z
updated: 2026-09-27T18:19:38.771Z
---
Implementation scope:
Integrate one append-only event into every successful mutation; implement newest-first owner history projection and UI.

Acceptance criteria:
- Event fields are complete and immutable; rejected writes add none; sensitive-token/session/body redaction tests pass.
- Every acceptance criterion in parent story S-017 is satisfied without weakening or deleting the red tests.
- Targeted tests and the relevant regression suite are green.
- Static analysis, security checks, and accessibility checks applicable to the slice pass.
- Changed files, exact verification commands, and results are attached as evidence.