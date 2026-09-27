---
id: T-023
type: task
title: Build participant table UI and prove end-to-end validation
parent: S-011
status: todo
dependsOn: [T-022]
estimate: 1.5
tags: [e2e, frontend, green, implementation, S-011]
archived: false
created: 2026-09-27T18:08:40.815Z
updated: 2026-09-27T18:19:38.280Z
---
Implementation scope:
Build participant table UI and prove end-to-end validation.

Acceptance criteria:
- Canonical/case duplicates and invalid values are rejected without audit; valid creation is atomic and audited once.
- The browser/client portion of every parent criterion is implemented accessibly without weakening earlier tests.
- Targeted Playwright tests and the full relevant regression suite are green.
- Test traces/screenshots on failure and final commands/results are attached as evidence.