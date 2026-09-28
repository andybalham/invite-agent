---
id: T-007
type: task
title: Specify draft lifecycle and validation with failing automated tests
parent: S-004
status: done
dependsOn: [T-006]
estimate: 1
tags: [red, S-004, test-first]
archived: false
created: 2026-09-27T18:08:39.683Z
updated: 2026-09-28T17:51:34.861Z
---
Purpose:
Lock the parent story's behavior before implementation.

Acceptance criteria:
- Automated domain unit/property and API contract tests encode every acceptance criterion in S-004, including happy paths and relevant invalid, authorization, concurrency, or privacy paths.
- The tests use deterministic isolated fixtures and assert observable state plus audit effects where applicable.
- A red run is captured showing failure because the required behavior is absent, not because the harness is broken or flaky.
- Exact commands and the requirement/story references are recorded as evidence.
- The red test change is not merged to the protected branch until the story's green implementation tasks complete.

Evidence:
- Story/requirements: S-004; US-01, US-03, US-04; requirements §§3–4 and 12.
- Added deterministic domain/property-style coverage in test/foundation/draft-lifecycle.test.mjs and API-boundary coverage in test/foundation/backend-validation.test.mjs.
- Red command: node --test test/foundation/draft-lifecycle.test.mjs test/foundation/backend-validation.test.mjs
- Red result: 9 tests, 2 passed, 7 failed because draft validation accepted an invalid zone/rejected an editable draft and the required lifecycle/readiness exports were absent.