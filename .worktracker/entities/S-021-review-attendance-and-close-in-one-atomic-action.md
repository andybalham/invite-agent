---
id: S-021
type: story
title: Review attendance and close in one atomic action
parent: E-007
dependsOn: [S-019]
estimate: 3
tags: [audit, closing, e2e, lifecycle]
archived: false
created: 2026-09-27T18:07:00.323Z
updated: 2026-09-27T18:07:00.323Z
---
Outcome:
Review attendance and close in one atomic action.

Source:
US-24, US-25; approved audit decision

Acceptance criteria:
- Choosing a proposed date shows that date, separate Yes/No participant lists, and an explicit closure warning.
- Cancelling leaves the poll Open with no selection or audit event.
- Confirming atomically records the selected date, status Closed, frozen top-five ranking, and exactly one combined selection/closure audit event.
- Transaction, contract, and Playwright tests prove all-or-nothing behavior.