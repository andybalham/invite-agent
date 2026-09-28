---
id: T-024
type: task
title: Specify collaborative participant rename and deletion with failing automated tests
parent: S-012
status: done
dependsOn: [T-023]
estimate: 1
tags: [red, S-012, test-first]
archived: false
created: 2026-09-27T18:08:40.878Z
updated: 2026-09-28T19:53:49.133Z
---
Purpose:
Lock the parent story's behavior before implementation.

Acceptance criteria:
- Automated repository, API contract, and Playwright tests encode every acceptance criterion in S-012, including happy paths and relevant invalid, authorization, concurrency, or privacy paths.
- The tests use deterministic isolated fixtures and assert observable state plus audit effects where applicable.
- A red run is captured showing failure because the required behavior is absent, not because the harness is broken or flaky.
- Exact commands and the requirement/story references are recorded as evidence.
- The red test change is not merged to the protected branch until the story's green implementation tasks complete.

Evidence:
- Extended DynamoDB/API tests for response-preserving rename, normalized duplicate rejection, exact-name delete confirmation, atomic no-change rejection, and one audit event per success.
- Added Playwright coverage for shared row actions, preserved invalid confirmation input, rename, and deletion.
- Red command: npm run test:e2e -- collaborative-availability.spec.ts.
- Result: 2 existing scenarios passed and the new scenario failed at the absent accessible "Actions for Alice" control, proving the missing UI behavior.