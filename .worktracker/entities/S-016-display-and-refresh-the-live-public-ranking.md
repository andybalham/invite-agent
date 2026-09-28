---
id: S-016
type: story
title: Display and refresh the live public ranking
parent: E-005
dependsOn: [S-014, S-015]
estimate: 3
tags: [design, design-authority, e2e, public-ui, ranking]
archived: false
created: 2026-09-27T18:06:59.913Z
updated: 2026-09-28T18:20:21.486Z
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

Design authority:
- For any user-facing UI this story creates, changes, serves, or verifies, `.docs/design/README.md` and `.docs/design/Gather Prototype.dc.html` are the primary sources for layout, copy, states, flows, responsive behavior, and Modernist tokens; use the chosen "1b — ranking-first" direction from `Poll Wireframes.dc.html` where applicable.
- Requirements and acceptance use cases remain the functional source of truth when behavior or validation limits conflict with the prototype, and the prototype-only black control bar must not be implemented.
- Acceptance evidence for UI-bearing work must cover applicable design hierarchy, copy, interaction states, accessibility, and responsive behavior, reusing the foundation established by S-032 rather than introducing a competing visual system.