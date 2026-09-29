---
id: T-035
type: task
title: Implement and verify live ranking presentation
parent: S-016
status: done
dependsOn: [T-034]
estimate: 2
tags: [green, implementation, S-016]
archived: false
created: 2026-09-27T18:08:41.596Z
updated: 2026-09-29T17:49:31.479Z
---
Implementation scope:
Integrate backend ranking into mutation/read representations and render accessible rank/date/Yes entries on the public page.

Acceptance criteria:
- All/five entry limits, time-zone display, tie order, and live refresh after add/toggle/rename/delete are visibly correct; tests pass.
- Every acceptance criterion in parent story S-016 is satisfied without weakening or deleting the red tests.
- Targeted tests and the relevant regression suite are green.
- Static analysis, security checks, and accessibility checks applicable to the slice pass.
- Changed files, exact verification commands, and results are attached as evidence.

Evidence (2026-09-29):
- Implemented the design-authority ranking-first section in frontend/src/main.ts and frontend/src/styles.css: ordered accessible list before the answers table, ordinal/date-or-date-time/Yes labels, server-defined order, five-entry cap, proportional Modernist bars, live/frozen copy and styling, and a responsive 375px layout.
- Preserved server-representation rendering after each mutation and the existing 750ms cross-client refresh. Add/toggle/rename/delete now update the ranking and totals from the returned/latest public projection.
- Added test/e2e/live-ranking.spec.ts without weakening the red assertions. It covers ranking matrices, ties, fewer/more than five choices, date-only and zoned date-time labels, hierarchy, accessibility semantics, responsive overflow, and cross-client live mutations.
- Focused green: & '.\scripts\Start-DevStack.ps1' -SkipBuild; & 'C:\nvm4w-monteith\nodejs\npm.cmd' run test:e2e -- live-ranking.spec.ts; ... — 3 passed.
- Static/foundation/security: & 'C:\nvm4w-monteith\nodejs\npm.cmd' run check — format, lint, typecheck, build, boundaries, 40 foundation tests, and security check passed.
- API/integration: Start-DevStack.ps1 -SkipBuild; node --test test/integration/collaborative-availability.test.mjs; Stop-DevStack.ps1 — 6 passed (projection, audit, invalid capability/input, rename/delete, concurrency).
- Full browser regression: Start-DevStack.ps1 -SkipBuild; npm run test:e2e; Stop-DevStack.ps1 — 22 passed, 1 intentionally skipped diagnostics test.
- git diff --check — passed; only line-ending notices were emitted.
- S-016 implementation/test files: frontend/src/main.ts, frontend/src/styles.css, test/e2e/live-ranking.spec.ts. Board evidence/status files are MCP-generated. S-015 ranking projection files and changes remain preserved.