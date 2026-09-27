---
id: T-050
type: task
title: Specify reopen and close-again lifecycle with failing automated tests
parent: S-024
status: todo
dependsOn: [T-047, T-049]
estimate: 1
tags: [red, S-024, test-first]
archived: false
created: 2026-09-27T18:08:42.602Z
updated: 2026-09-27T18:19:41.318Z
---
Purpose:
Lock the parent story's behavior before implementation.

Acceptance criteria:
- Automated state-machine, transaction, audit, and end-to-end Playwright tests encode every acceptance criterion in S-024, including happy paths and relevant invalid, authorization, concurrency, or privacy paths.
- The tests use deterministic isolated fixtures and assert observable state plus audit effects where applicable.
- A red run is captured showing failure because the required behavior is absent, not because the harness is broken or flaky.
- Exact commands and the requirement/story references are recorded as evidence.
- The red test change is not merged to the protected branch until the story's green implementation tasks complete.