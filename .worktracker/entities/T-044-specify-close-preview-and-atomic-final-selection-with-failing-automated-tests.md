---
id: T-044
type: task
title: Specify close preview and atomic final selection with failing automated tests
parent: S-021
status: todo
dependsOn: [T-041]
estimate: 1
tags: [red, S-021, test-first]
archived: false
created: 2026-09-27T18:08:42.191Z
updated: 2026-09-27T18:19:40.992Z
---
Purpose:
Lock the parent story's behavior before implementation.

Acceptance criteria:
- Automated attendance projection, transaction, contract, and Playwright tests encode every acceptance criterion in S-021, including happy paths and relevant invalid, authorization, concurrency, or privacy paths.
- The tests use deterministic isolated fixtures and assert observable state plus audit effects where applicable.
- A red run is captured showing failure because the required behavior is absent, not because the harness is broken or flaky.
- Exact commands and the requirement/story references are recorded as evidence.
- The red test change is not merged to the protected branch until the story's green implementation tasks complete.