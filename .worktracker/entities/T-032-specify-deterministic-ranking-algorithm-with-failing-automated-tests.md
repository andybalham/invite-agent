---
id: T-032
type: task
title: Specify deterministic ranking algorithm with failing automated tests
parent: S-015
status: done
dependsOn: [T-028]
estimate: 1
tags: [red, S-015, test-first]
archived: false
created: 2026-09-27T18:08:41.399Z
updated: 2026-09-29T17:38:05.164Z
---
Purpose:
Lock the parent story's behavior before implementation.

Acceptance criteria:
- Automated unit and property tests over arbitrary response matrices encode every acceptance criterion in S-015, including happy paths and relevant invalid, authorization, concurrency, or privacy paths.
- The tests use deterministic isolated fixtures and assert observable state plus audit effects where applicable.
- A red run is captured showing failure because the required behavior is absent, not because the harness is broken or flaky.
- Exact commands and the requirement/story references are recorded as evidence.
- The red test change is not merged to the protected branch until the story's green implementation tasks complete.