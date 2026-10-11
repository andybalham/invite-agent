---
id: T-158
type: task
title: Verify dashboard layout and interaction regressions across desktop and mobile
parent: S-059
status: todo
dependsOn: [T-157]
estimate: 2
tags: [browser-tests, regression, responsive]
archived: false
created: 2026-10-11T07:55:36.159Z
updated: 2026-10-11T07:55:36.159Z
---
Run and extend the real browser dashboard coverage.

Acceptance criteria:
- Desktop and mobile tests cover long-date polls, multiple poll results and expanded/collapsed date states.
- Tests verify title navigation and primary actions remain reachable.
- Tests verify debounced search, filters, load-more continuation and retry behaviour.
- Tests assert no page-level horizontal overflow at supported narrow widths.
- Existing My polls lifecycle/search/navigation suites pass unchanged or with updated assertions matching the design.