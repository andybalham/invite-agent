---
id: T-046
type: task
title: Specify closed-state enforcement and frozen results with failing automated tests
parent: S-022
status: todo
dependsOn: [T-045]
estimate: 1
tags: [red, S-022, test-first]
archived: false
created: 2026-09-27T18:08:42.320Z
updated: 2026-09-27T18:19:41.057Z
---
Purpose:
Lock the parent story's behavior before implementation.

Acceptance criteria:
- Automated lifecycle policy, API rejection, and fresh-context Playwright tests encode every acceptance criterion in S-022, including happy paths and relevant invalid, authorization, concurrency, or privacy paths.
- The tests use deterministic isolated fixtures and assert observable state plus audit effects where applicable.
- A red run is captured showing failure because the required behavior is absent, not because the harness is broken or flaky.
- Exact commands and the requirement/story references are recorded as evidence.
- The red test change is not merged to the protected branch until the story's green implementation tasks complete.