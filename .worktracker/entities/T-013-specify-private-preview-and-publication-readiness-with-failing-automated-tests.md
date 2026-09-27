---
id: T-013
type: task
title: Specify private preview and publication readiness with failing automated tests
parent: S-007
status: todo
dependsOn: [T-010, T-012]
estimate: 1
tags: [red, S-007, test-first]
archived: false
created: 2026-09-27T18:08:40.095Z
updated: 2026-09-27T18:19:39.998Z
---
Purpose:
Lock the parent story's behavior before implementation.

Acceptance criteria:
- Automated API privacy and Playwright preview tests encode every acceptance criterion in S-007, including happy paths and relevant invalid, authorization, concurrency, or privacy paths.
- The tests use deterministic isolated fixtures and assert observable state plus audit effects where applicable.
- A red run is captured showing failure because the required behavior is absent, not because the harness is broken or flaky.
- Exact commands and the requirement/story references are recorded as evidence.
- The red test change is not merged to the protected branch until the story's green implementation tasks complete.