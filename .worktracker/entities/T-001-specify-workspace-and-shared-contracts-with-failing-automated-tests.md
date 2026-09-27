---
id: T-001
type: task
title: Specify workspace and shared contracts with failing automated tests
parent: S-001
status: done
dependsOn: []
estimate: 1
tags: [red, S-001, test-first]
archived: false
created: 2026-09-27T18:08:39.237Z
updated: 2026-09-27T18:34:33.028Z
---
Purpose:
Lock the parent story's behavior before implementation.

Acceptance criteria:
- Automated unit and architecture-boundary tests encode every acceptance criterion in S-001, including happy paths and relevant invalid, authorization, concurrency, or privacy paths.
- The tests use deterministic isolated fixtures and assert observable state plus audit effects where applicable.
- A red run is captured showing failure because the required behavior is absent, not because the harness is broken or flaky.
- Exact commands and the requirement/story references are recorded as evidence.
- The red test change is not merged to the protected branch until the story's green implementation tasks complete.

Implementation evidence (2026-09-27):
- References: S-001; Architecture §§14, 16.2, and 16.8; user requirements §12 stable API error semantics.
- Added a dependency-free Node test harness plus deterministic contract fixtures.
- Added workspace/lock/root-command specifications in test/foundation/workspace.test.mjs.
- Added lifecycle, Yes/No availability, request/response DTO, authoritative validation, and stable error-code specifications in test/foundation/contracts.test.mjs.
- Added isolated production-boundary fixtures in test/foundation/boundaries.test.mjs; temporary directories are removed after every case.
- Exact aggregate command: & 'C:\nvm4w-monteith\nodejs\npm.cmd' test
- Aggregate red result: 10 tests executed, 0 passed, 10 failed, 0 cancelled, 0 skipped. Failures identify missing implementation: workspace declarations/root commands/lock entries, packages/contracts/dist/index.js, and scripts/check-production-boundaries.mjs.
- Exact targeted commands: node --test test/foundation/contracts.test.mjs; node --test test/foundation/boundaries.test.mjs
- Targeted red results: contracts 5/5 intentionally failing; boundaries 2/2 intentionally failing.
- Sanity check: git diff --check completed successfully.
- Files: package.json, package-lock.json, test/fixtures/contracts.mjs, test/foundation/workspace.test.mjs, test/foundation/contracts.test.mjs, test/foundation/boundaries.test.mjs.
- No commit or merge to the protected branch was performed.