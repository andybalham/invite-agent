---
id: T-026
type: task
title: Specify accessible availability toggles and Yes totals with failing automated tests
parent: S-013
status: done
dependsOn: [T-023]
estimate: 1
tags: [red, S-013, test-first]
archived: false
created: 2026-09-27T18:08:41.018Z
updated: 2026-09-28T19:56:25.044Z
---
Purpose:
Lock the parent story's behavior before implementation.

Acceptance criteria:
- Automated domain/repository, accessibility, API, and Playwright tests encode every acceptance criterion in S-013, including happy paths and relevant invalid, authorization, concurrency, or privacy paths.
- The tests use deterministic isolated fixtures and assert observable state plus audit effects where applicable.
- A red run is captured showing failure because the required behavior is absent, not because the harness is broken or flaky.
- Exact commands and the requirement/story references are recorded as evidence.
- The red test change is not merged to the protected branch until the story's green implementation tasks complete.

Evidence:
- Extended integration coverage for valid/invalid availability, monotonic latest-state responses, anonymous actor attribution, before/after values, and no audit on rejection.
- Added Playwright coverage for accessible labels, click, keyboard Space, autosave, visible Yes totals, and absence of a Save action.
- Red command: npm run test:e2e -- collaborative-availability.spec.ts.
- Result: 3 existing scenarios passed; the new scenario failed with zero accessible availability buttons, directly identifying the missing behavior.