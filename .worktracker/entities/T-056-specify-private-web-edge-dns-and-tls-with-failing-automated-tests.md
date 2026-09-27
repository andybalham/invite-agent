---
id: T-056
type: task
title: "Specify private web edge, DNS, and TLS with failing automated tests"
parent: S-027
status: todo
dependsOn: [T-055]
estimate: 1
tags: [red, S-027, test-first]
archived: false
created: 2026-09-27T18:08:43.035Z
updated: 2026-09-27T18:19:41.507Z
---
Purpose:
Lock the parent story's behavior before implementation.

Acceptance criteria:
- Automated CDK origin/behavior/rewrite/header/DNS assertions encode every acceptance criterion in S-027, including happy paths and relevant invalid, authorization, concurrency, or privacy paths.
- The tests use deterministic isolated fixtures and assert observable state plus audit effects where applicable.
- A red run is captured showing failure because the required behavior is absent, not because the harness is broken or flaky.
- Exact commands and the requirement/story references are recorded as evidence.
- The red test change is not merged to the protected branch until the story's green implementation tasks complete.