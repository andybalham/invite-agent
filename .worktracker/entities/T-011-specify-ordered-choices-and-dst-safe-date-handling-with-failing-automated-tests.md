---
id: T-011
type: task
title: Specify ordered choices and DST-safe date handling with failing automated tests
parent: S-006
status: todo
dependsOn: [T-008, T-067]
estimate: 1
tags: [red, S-006, test-first]
archived: false
created: 2026-09-27T18:08:39.951Z
updated: 2026-09-28T18:19:57.229Z
---
Purpose:
Lock the parent story's behavior before implementation.

Acceptance criteria:
- Automated date/time unit/property, contract, and Playwright tests encode every acceptance criterion in S-006, including happy paths and relevant invalid, authorization, concurrency, or privacy paths.
- The tests use deterministic isolated fixtures and assert observable state plus audit effects where applicable.
- A red run is captured showing failure because the required behavior is absent, not because the harness is broken or flaky.
- Exact commands and the requirement/story references are recorded as evidence.
- The red test change is not merged to the protected branch until the story's green implementation tasks complete.