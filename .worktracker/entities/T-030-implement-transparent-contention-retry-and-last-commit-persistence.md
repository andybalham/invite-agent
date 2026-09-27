---
id: T-030
type: task
title: Implement transparent contention retry and last-commit persistence
parent: S-014
status: todo
dependsOn: [T-029]
estimate: 1.5
tags: [backend, green, implementation, S-014]
archived: false
created: 2026-09-27T18:08:41.271Z
updated: 2026-09-27T18:08:41.271Z
---
Implementation scope:
Implement transparent contention retry and last-commit persistence.

Acceptance criteria:
- Implement bounded transparent retry, commit-order semantics, monotonic freshness versioning, and no client expected-version precondition.
- The service/repository/API portion of every parent criterion is implemented without weakening or deleting the red tests.
- Targeted unit, repository, and contract tests are green; failures retain actionable diagnostics.
- Files, commands, and test results are attached as evidence.