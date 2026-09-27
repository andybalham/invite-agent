---
id: T-022
type: task
title: "Implement participant domain, DynamoDB uniqueness, and public API"
parent: S-011
status: todo
dependsOn: [T-021]
estimate: 1.5
tags: [backend, green, implementation, S-011]
archived: false
created: 2026-09-27T18:08:40.744Z
updated: 2026-09-27T18:08:40.744Z
---
Implementation scope:
Implement participant domain, DynamoDB uniqueness, and public API.

Acceptance criteria:
- Implement participant/name-lock transactions, 100-code-point validation, NFKC case-fold keying, Yes/No validation, default-No responses, and public add/view APIs.
- The service/repository/API portion of every parent criterion is implemented without weakening or deleting the red tests.
- Targeted unit, repository, and contract tests are green; failures retain actionable diagnostics.
- Files, commands, and test results are attached as evidence.