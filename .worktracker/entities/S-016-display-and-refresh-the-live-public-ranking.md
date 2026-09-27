---
id: S-016
type: story
title: Display and refresh the live public ranking
parent: E-005
dependsOn: [S-014, S-015]
estimate: 3
tags: [e2e, public-ui, ranking]
archived: false
created: 2026-09-27T18:06:59.913Z
updated: 2026-09-27T18:06:59.913Z
---
Outcome:
Display and refresh the live public ranking.

Source:
US-17–US-19

Acceptance criteria:
- Each visible entry shows ordinal rank, correctly zoned date/time or date-only value, and Yes total.
- The public page renders no more than five entries in backend-defined order.
- Add, toggle, rename, and delete responses refresh table totals and ranking from the latest server representation.
- Playwright tests exercise ranking matrices, ties, fewer/more than five choices, and live updates.