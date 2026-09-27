---
id: T-054
type: task
title: "Specify Lambda, API Gateway, and Cognito stacks with failing automated tests"
parent: S-026
status: todo
dependsOn: [T-053]
estimate: 1
tags: [red, S-026, test-first]
archived: false
created: 2026-09-27T18:08:42.882Z
updated: 2026-09-27T18:19:41.446Z
---
Purpose:
Lock the parent story's behavior before implementation.

Acceptance criteria:
- Automated CDK IAM/authorizer and Lambda bundle execution tests encode every acceptance criterion in S-026, including happy paths and relevant invalid, authorization, concurrency, or privacy paths.
- The tests use deterministic isolated fixtures and assert observable state plus audit effects where applicable.
- A red run is captured showing failure because the required behavior is absent, not because the harness is broken or flaky.
- Exact commands and the requirement/story references are recorded as evidence.
- The red test change is not merged to the protected branch until the story's green implementation tasks complete.