---
id: E-007
type: epic
title: "E7 — Final decision and reversible poll lifecycle"
parent: null
dependsOn: [E-006]
estimate: 12
tags: [closing, e2e, lifecycle, location, reopening]
archived: false
created: 2026-09-27T18:05:21.733Z
updated: 2026-09-27T18:05:21.733Z
---
Visible deliverable:
An organiser can review attendance, close an open poll on a chosen date, present a stable public result, maintain location details while closed, reopen collaboration, and close again.

Acceptance criteria:
- The close preview shows the chosen date, Yes and No participant lists, and an explicit closure warning.
- Confirmation selects the date, closes the poll, freezes the top-five ranking, and creates exactly one atomic audit revision.
- Closed public views prominently show the result and frozen ranking; participant and date mutations are rejected by UI and server.
- Location may be set, edited, or cleared in Draft, Open, or Closed without changing lifecycle state, and each successful change is immediately visible and audited.
- Reopening requires confirmation, restores editing and live ranking, retains the prior selection as provisional, and creates a separate audit revision.
- A reopened poll can close again with the same or a different date while preserving full history.
- Full local Playwright journeys and server-enforcement contract tests pass.