---
id: S-021
type: story
title: Review attendance and close in one atomic action
parent: E-007
dependsOn: [S-019]
estimate: 3
tags: [audit, closing, design, design-authority, e2e, lifecycle]
archived: false
created: 2026-09-27T18:07:00.323Z
updated: 2026-09-28T18:20:21.774Z
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

Design authority:
- For any user-facing UI this story creates, changes, serves, or verifies, `.docs/design/README.md` and `.docs/design/Gather Prototype.dc.html` are the primary sources for layout, copy, states, flows, responsive behavior, and Modernist tokens; use the chosen "1b — ranking-first" direction from `Poll Wireframes.dc.html` where applicable.
- Requirements and acceptance use cases remain the functional source of truth when behavior or validation limits conflict with the prototype, and the prototype-only black control bar must not be implemented.
- Acceptance evidence for UI-bearing work must cover applicable design hierarchy, copy, interaction states, accessibility, and responsive behavior, reusing the foundation established by S-032 rather than introducing a competing visual system.