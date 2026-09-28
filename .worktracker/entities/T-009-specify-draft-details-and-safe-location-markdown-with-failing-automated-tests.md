---
id: T-009
type: task
title: Specify draft details and safe location Markdown with failing automated tests
parent: S-005
status: done
dependsOn: [T-008]
estimate: 1
tags: [red, S-005, test-first]
archived: false
created: 2026-09-27T18:08:39.818Z
updated: 2026-09-28T18:04:57.115Z
---
Purpose:
Lock the parent story's behavior before implementation.

Acceptance criteria:
- Automated validation/security contract and Playwright tests encode every acceptance criterion in S-005, including happy paths and relevant invalid, authorization, concurrency, or privacy paths.
- The tests use deterministic isolated fixtures and assert observable state plus audit effects where applicable.
- A red run is captured showing failure because the required behavior is absent, not because the harness is broken or flaky.
- Exact commands and the requirement/story references are recorded as evidence.
- The red test change is not merged to the protected branch until the story's green implementation tasks complete.