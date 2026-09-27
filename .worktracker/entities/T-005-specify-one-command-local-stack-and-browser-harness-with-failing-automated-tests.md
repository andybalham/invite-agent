---
id: T-005
type: task
title: Specify one-command local stack and browser harness with failing automated tests
parent: S-003
status: done
dependsOn: [T-004]
estimate: 1
tags: [red, S-003, test-first]
archived: false
created: 2026-09-27T18:08:39.526Z
updated: 2026-09-27T19:08:00.508Z
---
Purpose:
Lock the parent story's behavior before implementation.

Acceptance criteria:
- Automated PowerShell orchestration and Playwright smoke tests encode every acceptance criterion in S-003, including happy paths and relevant invalid, authorization, concurrency, or privacy paths.
- The tests use deterministic isolated fixtures and assert observable state plus audit effects where applicable.
- A red run is captured showing failure because the required behavior is absent, not because the harness is broken or flaky.
- Exact commands and the requirement/story references are recorded as evidence.
- The red test change is not merged to the protected branch until the story's green implementation tasks complete.

Evidence:
- Story/requirement: S-003; Architecture §§16.6–16.8.
- Added test/foundation/dev-harness.test.mjs, test/e2e/fixtures.ts, and test/e2e/shell.spec.ts.
- Red command: node --test test/foundation/dev-harness.test.mjs
- Red result: 3 tests failed with ENOENT for scripts/Start-DevStack.ps1, frontend/src/main.ts, and playwright.config.ts, demonstrating the intended behavior is absent while the Node test harness itself runs deterministically.