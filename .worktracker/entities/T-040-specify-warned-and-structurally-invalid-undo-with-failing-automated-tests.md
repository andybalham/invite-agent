---
id: T-040
type: task
title: Specify warned and structurally invalid undo with failing automated tests
parent: S-019
status: done
dependsOn: [T-039]
estimate: 1
tags: [red, S-019, test-first]
archived: false
created: 2026-09-27T18:08:41.939Z
updated: 2026-09-29T18:23:42.244Z
---
Purpose:
Lock the parent story's behavior before implementation.

Acceptance criteria:
- Automated overlap/structure unit, transaction, contract, and Playwright tests encode every acceptance criterion in S-019, including happy paths and relevant invalid, authorization, concurrency, or privacy paths.
- The tests use deterministic isolated fixtures and assert observable state plus audit effects where applicable.
- A red run is captured showing failure because the required behavior is absent, not because the harness is broken or flaky.
- Exact commands and the requirement/story references are recorded as evidence.
- The red test change is not merged to the protected branch until the story's green implementation tasks complete.