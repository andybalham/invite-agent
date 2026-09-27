---
id: T-060
type: task
title: Specify test-gated release automation with failing tests
parent: S-029
status: todo
dependsOn: [T-057, T-059]
estimate: 1
tags: [ci-cd, red, test-first]
archived: false
created: 2026-09-27T18:09:21.332Z
updated: 2026-09-27T18:19:41.700Z
---
Purpose:
Lock the release workflow ordering, packaging, failure, and diagnostics behavior before implementation.

Acceptance criteria:
- Automated pipeline and reproducible-build tests assert locked install; all local gates; ZIP/Vite builds; synth/security checks; explicit environment validation; deploy; alias update; asset upload; and scoped invalidation.
- Negative tests prove no deployment begins after any failed gate and diagnostics/artifacts are retained.
- A red run is captured because the workflow is not implemented, not because the test harness is broken.
- Exact commands and architecture §15/§16 references are recorded; red tests do not merge alone to the protected branch.