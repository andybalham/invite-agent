---
id: T-029
type: task
title: Specify last-update-wins service and client convergence with failing automated tests
parent: S-014
status: todo
dependsOn: [T-028]
estimate: 1
tags: [red, S-014, test-first]
archived: false
created: 2026-09-27T18:08:41.206Z
updated: 2026-09-27T18:19:40.432Z
---
Purpose:
Lock the parent story's behavior before implementation.

Acceptance criteria:
- Automated controlled DynamoDB contention, API, and two-context Playwright tests encode every acceptance criterion in S-014, including happy paths and relevant invalid, authorization, concurrency, or privacy paths.
- The tests use deterministic isolated fixtures and assert observable state plus audit effects where applicable.
- A red run is captured showing failure because the required behavior is absent, not because the harness is broken or flaky.
- Exact commands and the requirement/story references are recorded as evidence.
- The red test change is not merged to the protected branch until the story's green implementation tasks complete.