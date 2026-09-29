---
id: T-038
type: task
title: Specify ordinary compensating undo with failing automated tests
parent: S-018
status: done
dependsOn: [T-037]
estimate: 1
tags: [red, S-018, test-first]
archived: false
created: 2026-09-27T18:08:41.806Z
updated: 2026-09-29T18:13:24.949Z
---
Purpose:
Lock the parent story's behavior before implementation.

Acceptance criteria:
- Automated undo inversion unit/property, transaction, API, and Playwright tests encode every acceptance criterion in S-018, including happy paths and relevant invalid, authorization, concurrency, or privacy paths.
- The tests use deterministic isolated fixtures and assert observable state plus audit effects where applicable.
- A red run is captured showing failure because the required behavior is absent, not because the harness is broken or flaky.
- Exact commands and the requirement/story references are recorded as evidence.
- The red test change is not merged to the protected branch until the story's green implementation tasks complete.