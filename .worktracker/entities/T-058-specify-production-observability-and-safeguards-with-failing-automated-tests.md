---
id: T-058
type: task
title: Specify production observability and safeguards with failing automated tests
parent: S-028
status: todo
dependsOn: [T-055]
estimate: 1
tags: [red, S-028, test-first]
archived: false
created: 2026-09-27T18:08:43.177Z
updated: 2026-09-27T18:19:41.571Z
---
Purpose:
Lock the parent story's behavior before implementation.

Acceptance criteria:
- Automated CDK logging/alarm/encryption/limit assertions encode every acceptance criterion in S-028, including happy paths and relevant invalid, authorization, concurrency, or privacy paths.
- The tests use deterministic isolated fixtures and assert observable state plus audit effects where applicable.
- A red run is captured showing failure because the required behavior is absent, not because the harness is broken or flaky.
- Exact commands and the requirement/story references are recorded as evidence.
- The red test change is not merged to the protected branch until the story's green implementation tasks complete.