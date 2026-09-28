---
id: T-031
type: task
title: Implement client freshness handling and prove two-context convergence
parent: S-014
status: done
dependsOn: [T-030]
estimate: 1.5
tags: [e2e, frontend, green, implementation, S-014]
archived: false
created: 2026-09-27T18:08:41.336Z
updated: 2026-09-28T20:03:19.480Z
---
Implementation scope:
Implement client freshness handling and prove two-context convergence.

Acceptance criteria:
- Both stale writes are accepted and audited; last commit persists; no conflict response/warning is emitted.
- The browser/client portion of every parent criterion is implemented accessibly without weakening earlier tests.
- Targeted Playwright tests and the full relevant regression suite are green.
- Test traces/screenshots on failure and final commands/results are attached as evidence.

Evidence:
- Added 750 ms public-state refresh with immediate focus/visibility refresh, monotonic version guards, stale-response rejection, and a 1.6 s visual freshness flash for externally changed cells.
- Targeted command: npm run build followed by Playwright collaborative-availability.spec.ts — build green and 5/5 Chromium scenarios green, including controlled opposing edits from two stale browser contexts and convergence without conflict text.
- Final regression commands: npm run check; local dev stack + npm run test:integration; local dev stack + npm run test:e2e.
- Final results: 37/37 foundation tests green with format/lint/type/security checks green; 14/14 integration tests green; 19 Playwright tests passed and the intentional diagnostics scenario was skipped.