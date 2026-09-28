---
id: T-019
type: task
title: Specify organiser authentication and ownership with failing automated tests
parent: S-010
status: done
dependsOn: [T-016]
estimate: 1
tags: [red, S-010, test-first]
archived: false
created: 2026-09-27T18:08:40.538Z
updated: 2026-09-28T19:34:13.291Z
---
Purpose:
Lock the parent story's behavior before implementation.

Acceptance criteria:
- Automated route-matrix contract and production-boundary tests encode every acceptance criterion in S-010, including happy paths and relevant invalid, authorization, concurrency, or privacy paths.
- The tests use deterministic isolated fixtures and assert observable state plus audit effects where applicable.
- A red run is captured showing failure because the required behavior is absent, not because the harness is broken or flaky.
- Exact commands and the requirement/story references are recorded as evidence.
- The red test change is not merged to the protected branch until the story's green implementation tasks complete.

Evidence (2026-09-28):
- References: E-003 / S-010; US-31, US-32; architecture §§5.4 and 11.
- Added test/integration/organiser-authorization.test.mjs covering GET, PUT, readiness, and publish for missing identity, capability-only identity, wrong owner, mutation/audit invariance, and spoofed body ownership.
- Existing boundary tests cover rejection of production imports from local auth and production composition guards.
- Red command: npm run test:integration under the managed local stack.
- Result: 6/7 passed; the expected failure was the spoofed owner payload returning 400 instead of being ignored while the verified context owned the new poll.