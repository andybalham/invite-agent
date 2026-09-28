---
id: T-017
type: task
title: Specify safe public poll view with failing automated tests
parent: S-009
status: done
dependsOn: [T-016]
estimate: 1
tags: [red, S-009, test-first]
archived: false
created: 2026-09-27T18:08:40.387Z
updated: 2026-09-28T19:30:43.819Z
---
Purpose:
Lock the parent story's behavior before implementation.

Acceptance criteria:
- Automated public API security and unauthenticated Playwright tests encode every acceptance criterion in S-009, including happy paths and relevant invalid, authorization, concurrency, or privacy paths.
- The tests use deterministic isolated fixtures and assert observable state plus audit effects where applicable.
- A red run is captured showing failure because the required behavior is absent, not because the harness is broken or flaky.
- Exact commands and the requirement/story references are recorded as evidence.
- The red test change is not merged to the protected branch until the story's green implementation tasks complete.

Evidence (2026-09-28):
- References: E-003 / S-009; US-06, US-07, US-08, US-35.
- API security/projection assertions are in test/integration/publication.test.mjs; fresh-context and invalid-link UI assertions are in test/e2e/public-poll.spec.ts.
- Red command: npm run test:e2e -- --grep 'fresh unauthenticated browser' under the managed local stack.
- Result: 1 expected browser failure because /p/:token still rendered the organiser shell and did not expose the public-view “No account needed” state; API setup succeeded and diagnostics were captured.