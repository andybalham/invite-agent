---
id: T-153
type: task
title: Specify compact date summaries and disclosure contracts with automated tests
parent: S-058
status: todo
dependsOn: []
estimate: 2
tags: [accessibility, dates, tests]
archived: false
created: 2026-10-11T07:55:35.762Z
updated: 2026-10-11T07:55:35.762Z
---
Add failing-first unit/component coverage for the date-summary presentation.

Acceptance criteria:
- Tests define zero-date, preview-date, small-set disclosure and large-set dialog cases.
- Tests assert date counts, saved order, date-only formatting and timed date/time-zone/UTC-offset formatting.
- Tests assert closed-poll final-date summary behaviour.
- Tests assert aria-expanded/aria-controls, keyboard activation, focus restoration and Escape/close semantics.
- Tests cover both desktop table and mobile card render paths.
- The tests fail against the current uncollapsed full-list behaviour where the new contract is not yet implemented.