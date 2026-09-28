---
id: T-028
type: task
title: Build accessible autosaving cells and prove mouse/keyboard behavior
parent: S-013
status: done
dependsOn: [T-027]
estimate: 1.5
tags: [e2e, frontend, green, implementation, S-013]
archived: false
created: 2026-09-27T18:08:41.148Z
updated: 2026-09-28T19:58:07.317Z
---
Implementation scope:
Build accessible autosaving cells and prove mouse/keyboard behavior.

Acceptance criteria:
- Server accepts only Yes/No, totals count only Yes, responses return newest state, and audit actor/before/after fields are correct.
- The browser/client portion of every parent criterion is implemented accessibly without weakening earlier tests.
- Targeted Playwright tests and the full relevant regression suite are green.
- Test traces/screenshots on failure and final commands/results are attached as evidence.

Evidence:
- Added real button cells with participant/date/state accessible names, aria-pressed, mouse and native Space activation, autosave busy states, latest-version rendering, visible Yes totals, help copy, and error status messaging.
- Commands: npm run build; Playwright collaborative-availability.spec.ts.
- Results: build green; 4/4 targeted Chromium scenarios green.