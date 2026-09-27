---
id: T-031
type: task
title: Implement client freshness handling and prove two-context convergence
parent: S-014
status: todo
dependsOn: [T-030]
estimate: 1.5
tags: [e2e, frontend, green, implementation, S-014]
archived: false
created: 2026-09-27T18:08:41.336Z
updated: 2026-09-27T18:19:38.437Z
---
Implementation scope:
Implement client freshness handling and prove two-context convergence.

Acceptance criteria:
- Both stale writes are accepted and audited; last commit persists; no conflict response/warning is emitted.
- The browser/client portion of every parent criterion is implemented accessibly without weakening earlier tests.
- Targeted Playwright tests and the full relevant regression suite are green.
- Test traces/screenshots on failure and final commands/results are attached as evidence.