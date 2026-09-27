---
id: T-027
type: task
title: "Implement toggle transactions, totals, latest-state response, and audit"
parent: S-013
status: todo
dependsOn: [T-026]
estimate: 1.5
tags: [backend, green, implementation, S-013]
archived: false
created: 2026-09-27T18:08:41.084Z
updated: 2026-09-27T18:08:41.084Z
---
Implementation scope:
Implement toggle transactions, totals, latest-state response, and audit.

Acceptance criteria:
- Implement atomic cell mutation, total calculation, latest-representation response, and one audit event per toggle.
- The service/repository/API portion of every parent criterion is implemented without weakening or deleting the red tests.
- Targeted unit, repository, and contract tests are green; failures retain actionable diagnostics.
- Files, commands, and test results are attached as evidence.