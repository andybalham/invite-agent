---
id: T-167
type: task
title: Add integrated My polls improvement acceptance coverage
parent: S-061
status: done
dependsOn: [T-155, T-158, T-166]
estimate: 2
tags: [acceptance-tests, integration, regression]
archived: false
created: 2026-10-11T07:56:50.717Z
updated: 2026-10-11T17:43:30.843Z
---
Assemble the focused automated suite for the complete design.

Acceptance criteria:
- The suite covers compact date summaries, large-set disclosure, responsive cards/table, loaded-result feedback and debounced search.
- The suite covers publication landing and canonical poll-page sharing, including closed polls and rotation.
- The suite proves that dashboard navigation works without dashboard-owned share state.
- The suite runs with isolated test data and reports actionable failure diagnostics.
- Existing My polls lifecycle, search, pagination, navigation, public-link isolation and regression tests remain green.