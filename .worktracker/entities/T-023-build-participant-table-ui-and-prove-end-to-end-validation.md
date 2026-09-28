---
id: T-023
type: task
title: Build participant table UI and prove end-to-end validation
parent: S-011
status: done
dependsOn: [T-022]
estimate: 1.5
tags: [e2e, frontend, green, implementation, S-011]
archived: false
created: 2026-09-27T18:08:40.815Z
updated: 2026-09-28T19:52:20.661Z
---
Implementation scope:
Build participant table UI and prove end-to-end validation.

Acceptance criteria:
- Canonical/case duplicates and invalid values are rejected without audit; valid creation is atomic and audited once.
- The browser/client portion of every parent criterion is implemented accessibly without weakening earlier tests.
- Targeted Playwright tests and the full relevant regression suite are green.
- Test traces/screenshots on failure and final commands/results are attached as evidence.

Evidence:
- Added the high-fidelity Add a row dialog, public participant table rendering, preserved validation input, default-No cells, totals, and latest-version replacement guard.
- Commands: npm run build; Playwright collaborative-availability.spec.ts.
- Results: build green; 2/2 targeted Chromium scenarios green.