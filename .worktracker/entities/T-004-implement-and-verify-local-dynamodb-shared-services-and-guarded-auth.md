---
id: T-004
type: task
title: "Implement and verify local DynamoDB, shared services, and guarded auth"
parent: S-002
status: todo
dependsOn: [T-003]
estimate: 2
tags: [green, implementation, S-002]
archived: false
created: 2026-09-27T18:08:39.451Z
updated: 2026-09-27T18:19:37.530Z
---
Implementation scope:
Implement table initialization, repositories, shared application services, local HTTP translation, configuration, and local-only auth guards.

Acceptance criteria:
- Tests run without AWS credentials; local/test auth works deterministically; production composition cannot import or enable the bypass.
- Every acceptance criterion in parent story S-002 is satisfied without weakening or deleting the red tests.
- Targeted tests and the relevant regression suite are green.
- Static analysis, security checks, and accessibility checks applicable to the slice pass.
- Changed files, exact verification commands, and results are attached as evidence.