---
id: T-172
type: task
title: Run and document the complete non-exhaustive regression suite
parent: S-062
status: todo
dependsOn: [T-169, T-170, T-171]
estimate: 1
tags: [e2e, integration, regression, verification]
archived: false
created: 2026-10-11T11:44:01.691Z
updated: 2026-10-11T11:44:01.691Z
---
Run build, lint, serial component tests, full integration tests, and focused non-exhaustive E2E suites after the preceding fixes. Record commands, Docker/local-service prerequisites, results, and any run evidence in the task body or linked project evidence. Acceptance: all required non-exhaustive checks pass; S-060 sharing, owner-isolation, token-secrecy, and rotation coverage remains green; no exhaustive suite is required for completion.