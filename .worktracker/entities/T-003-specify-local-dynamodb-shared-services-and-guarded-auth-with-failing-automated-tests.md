---
id: T-003
type: task
title: "Specify local DynamoDB, shared services, and guarded auth with failing automated tests"
parent: S-002
status: done
dependsOn: [T-002]
estimate: 1
tags: [red, S-002, test-first]
archived: false
created: 2026-09-27T18:08:39.381Z
updated: 2026-09-27T18:50:15.025Z
---
Purpose:
Lock the parent story's behavior before implementation.

Acceptance criteria:
- Automated DynamoDB integration and API contract tests encode every acceptance criterion in S-002, including happy paths and relevant invalid, authorization, concurrency, or privacy paths.
- The tests use deterministic isolated fixtures and assert observable state plus audit effects where applicable.
- A red run is captured showing failure because the required behavior is absent, not because the harness is broken or flaky.
- Exact commands and the requirement/story references are recorded as evidence.
- The red test change is not merged to the protected branch until the story's green implementation tasks complete.

Evidence:
- Red test: `C:\nvm4w-monteith\nodejs\npm.cmd run test:integration`
- Result: 3/3 contract tests failed because `backend/dist/adapters/local/composition.js` was absent (expected red state; build and test harness completed normally).
- Coverage: Architecture §§16.1–16.5 and parent story S-002; deterministic table isolation/health, shared validation/persistence/audit/authorization/error mapping, unauthenticated and cross-owner rejection, and production auth guard.