---
id: T-021
type: task
title: "Specify participant viewing, creation, and name validation with failing automated tests"
parent: S-011
status: todo
dependsOn: [T-018]
estimate: 1
tags: [red, S-011, test-first]
archived: false
created: 2026-09-27T18:08:40.677Z
updated: 2026-09-27T18:19:40.243Z
---
Purpose:
Lock the parent story's behavior before implementation.

Acceptance criteria:
- Automated name-normalisation unit/property, DynamoDB uniqueness, API, and Playwright tests encode every acceptance criterion in S-011, including happy paths and relevant invalid, authorization, concurrency, or privacy paths.
- The tests use deterministic isolated fixtures and assert observable state plus audit effects where applicable.
- A red run is captured showing failure because the required behavior is absent, not because the harness is broken or flaky.
- Exact commands and the requirement/story references are recorded as evidence.
- The red test change is not merged to the protected branch until the story's green implementation tasks complete.