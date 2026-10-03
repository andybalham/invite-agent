---
id: T-052
type: task
title: Specify production DynamoDB stacks with failing automated tests
parent: S-025
status: todo
dependsOn: [T-051, T-127]
estimate: 1
tags: [red, S-025, test-first]
archived: false
created: 2026-09-27T18:08:42.743Z
updated: 2026-10-03T16:45:40.342Z
---
Purpose:
Lock the parent story's behavior before implementation.

Acceptance criteria:
- Automated CDK assertions and local/deployed schema-parity tests encode every acceptance criterion in S-025, including happy paths and relevant invalid, authorization, concurrency, or privacy paths.
- The tests use deterministic isolated fixtures and assert observable state plus audit effects where applicable.
- A red run is captured showing failure because the required behavior is absent, not because the harness is broken or flaky.
- Exact commands and the requirement/story references are recorded as evidence.
- The red test change is not merged to the protected branch until the story's green implementation tasks complete.