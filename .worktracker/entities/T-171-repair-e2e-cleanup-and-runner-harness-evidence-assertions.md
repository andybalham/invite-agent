---
id: T-171
type: task
title: Repair E2E cleanup and runner harness evidence assertions
parent: S-062
status: todo
dependsOn: []
estimate: 2
tags: [e2e, integration, regression, test-harness]
archived: false
created: 2026-10-11T11:43:59.649Z
updated: 2026-10-11T11:43:59.649Z
---
Repair the E2E cleanup and runner integration harnesses so they discover the intended focused tests and persist/validate run summaries and diagnostics correctly. Acceptance: cleanup isolation and runner tests pass with Docker-backed evidence, failures preserve diagnostics, and the harness does not depend on stale processes, occupied ports, or missing test globs.