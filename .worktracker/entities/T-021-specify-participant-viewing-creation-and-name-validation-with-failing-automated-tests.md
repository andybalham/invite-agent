---
id: T-021
type: task
title: "Specify participant viewing, creation, and name validation with failing automated tests"
parent: S-011
status: done
dependsOn: [T-018]
estimate: 1
tags: [red, S-011, test-first]
archived: false
created: 2026-09-27T18:08:40.677Z
updated: 2026-09-28T19:46:26.982Z
---
Purpose:
Lock the parent story's behavior before implementation.

Acceptance criteria:
- Automated name-normalisation unit/property, DynamoDB uniqueness, API, and Playwright tests encode every acceptance criterion in S-011, including happy paths and relevant invalid, authorization, concurrency, or privacy paths.
- The tests use deterministic isolated fixtures and assert observable state plus audit effects where applicable.
- A red run is captured showing failure because the required behavior is absent, not because the harness is broken or flaky.
- Exact commands and the requirement/story references are recorded as evidence.
- The red test change is not merged to the protected branch until the story's green implementation tasks complete.

Evidence:
- Added test/foundation/participant-name.test.mjs and test/integration/collaborative-availability.test.mjs for S-011 / US-08–US-11.
- Red command: node --test test/foundation/participant-name.test.mjs
- Result: 4 expected failures because backend/dist/domain/participant-name.js does not yet exist; the test harness ran successfully.