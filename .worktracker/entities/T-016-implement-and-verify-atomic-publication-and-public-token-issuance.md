---
id: T-016
type: task
title: Implement and verify atomic publication and public-token issuance
parent: S-008
status: todo
dependsOn: [T-015]
estimate: 2
tags: [green, implementation, S-008]
archived: false
created: 2026-09-27T18:08:40.305Z
updated: 2026-09-27T18:19:38.116Z
---
Implementation scope:
Implement publish transaction, 192-bit Base64URL generation, keyed hashing, raw-token handling, link construction/copy support, and audit event.

Acceptance criteria:
- Only valid Drafts publish; raw tokens are never stored/logged; token uniqueness/format and one-event atomicity are proven; tests pass.
- Every acceptance criterion in parent story S-008 is satisfied without weakening or deleting the red tests.
- Targeted tests and the relevant regression suite are green.
- Static analysis, security checks, and accessibility checks applicable to the slice pass.
- Changed files, exact verification commands, and results are attached as evidence.