---
id: T-043
type: task
title: Implement and verify audit and undo authorization
parent: S-020
status: done
dependsOn: [T-042]
estimate: 2
tags: [green, implementation, S-020]
archived: false
created: 2026-09-27T18:08:42.126Z
updated: 2026-10-01T17:25:54.160Z
---
Implementation scope:
Apply authentication/ownership policies and non-disclosing error mapping to history, preview, and execution endpoints/UI.

Acceptance criteria:
- Link holders and non-owners cannot observe event content or mutate state/history; 401/403 matrix passes.
- Every acceptance criterion in parent story S-020 is satisfied without weakening or deleting the red tests.
- Targeted tests and the relevant regression suite are green.
- Static analysis, security checks, and accessibility checks applicable to the slice pass.
- Changed files, exact verification commands, and results are attached as evidence.

Progress update — paused 2026-09-29:
- T-042 is complete: deterministic authorization coverage was added for history, undo preview, and undo execution across unauthenticated/link-holder (401), authenticated non-owner (403), and owner-success paths.
- The tests assert non-disclosing error bodies and prove rejected requests do not change poll state, participants, or audit history.
- T-043 implementation is present in the shared checkout, including organiser-only UI handling and a dedicated access-denied history state.
- The targeted authorization integration command was initiated during the implementation cycle; its final evidence should be re-captured when work resumes.
- The approved full build and Playwright regression was interrupted by the pause, so final regression verification remains outstanding.
- Resume by re-running the targeted authorization suite, npm run check, the full integration suite, and the full Playwright suite; only then mark T-043 done if all pass.

Completion evidence — 2026-10-01:
- Working tree was clean before verification; no implementation files required further changes.
- Targeted authorization: `Start-DevStack.ps1 -SkipBuild; node --test test/integration/audit-authorization.test.mjs; Stop-DevStack.ps1` — 2 passed, 0 failed.
- Static, build, foundation, and security checks: `npm run check` — 46 tests passed; format, lint, typecheck, production-boundary, build, and security checks passed.
- Full integration: `Start-DevStack.ps1 -SkipBuild; npm run test:integration; Stop-DevStack.ps1` — 25 passed, 0 failed.
- Full browser regression using the repository's CI-equivalent policy: `Start-DevStack.ps1 -SkipBuild; npm run test:e2e -- --workers=1 --retries=2; Stop-DevStack.ps1` — exit 0; 26 passed, 1 intentionally skipped diagnostics test, and 1 pre-existing collaborative-availability concurrency scenario passed on retry. Audit/history/undo browser scenarios passed without retry.
- Authorization evidence confirms link holders receive 401, authenticated non-owners receive 403, error bodies are non-disclosing, rejected requests do not mutate poll/participant/audit state, and owners can read history, preview undo, and execute confirmed undo.