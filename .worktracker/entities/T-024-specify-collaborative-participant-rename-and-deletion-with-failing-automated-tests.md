---
id: T-024
type: task
title: Specify collaborative participant rename and deletion with failing automated tests
parent: S-012
status: todo
dependsOn: [T-023]
estimate: 1
tags: [red, S-012, test-first]
archived: false
created: 2026-09-27T18:08:40.878Z
updated: 2026-09-27T18:19:40.304Z
---
Purpose:
Lock the parent story's behavior before implementation.

Acceptance criteria:
- Automated repository, API contract, and Playwright tests encode every acceptance criterion in S-012, including happy paths and relevant invalid, authorization, concurrency, or privacy paths.
- The tests use deterministic isolated fixtures and assert observable state plus audit effects where applicable.
- A red run is captured showing failure because the required behavior is absent, not because the harness is broken or flaky.
- Exact commands and the requirement/story references are recorded as evidence.
- The red test change is not merged to the protected branch until the story's green implementation tasks complete.