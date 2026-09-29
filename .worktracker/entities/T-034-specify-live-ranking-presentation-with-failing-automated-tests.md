---
id: T-034
type: task
title: Specify live ranking presentation with failing automated tests
parent: S-016
status: done
dependsOn: [T-031, T-033]
estimate: 1
tags: [red, S-016, test-first]
archived: false
created: 2026-09-27T18:08:41.535Z
updated: 2026-09-29T17:46:39.853Z
---
Purpose:
Lock the parent story's behavior before implementation.

Acceptance criteria:
- Automated API projection and Playwright ranking tests encode every acceptance criterion in S-016, including happy paths and relevant invalid, authorization, concurrency, or privacy paths.
- The tests use deterministic isolated fixtures and assert observable state plus audit effects where applicable.
- A red run is captured showing failure because the required behavior is absent, not because the harness is broken or flaky.
- Exact commands and the requirement/story references are recorded as evidence.
- The red test change is not merged to the protected branch until the story's green implementation tasks complete.

Evidence (2026-09-29):
- Added test/e2e/live-ranking.spec.ts for S-016 / US-17-US-19: backend-ordered top five, ordinal/date-or-date-time/Yes presentation, stable ties, fewer/more than five choices, ranking-first hierarchy, and cross-client add/toggle/rename/delete refresh.
- Existing API/foundation coverage supplies deterministic projection, authorization/invalid-input, concurrency, privacy, and audit assertions in test/foundation/ranking.test.mjs, test/integration/collaborative-availability.test.mjs, and test/e2e/public-poll.spec.ts.
- Build command: & 'C:\nvm4w-monteith\nodejs\npm.cmd' run build — PASS.
- Red command: & '.\scripts\Start-DevStack.ps1' -SkipBuild; & 'C:\nvm4w-monteith\nodejs\npm.cmd' run test:e2e -- live-ranking.spec.ts; $code = $LASTEXITCODE; & '.\scripts\Stop-DevStack.ps1'; exit $code
- Red result: 3 failed, 0 passed. Every failure resolved a healthy public poll but could not find role=list, aria-label='Most popular dates'; the absence of the required UI caused the failures.