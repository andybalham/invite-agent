---
id: S-006
type: story
title: Manage ordered date and date-time choices safely across DST
parent: E-002
dependsOn: [S-004, S-032]
estimate: 3
tags: [dates, design, design-authority, dst, e2e, property-test, timezone]
archived: false
created: 2026-09-27T18:06:59.088Z
updated: 2026-09-28T18:20:20.928Z
---
Outcome:
Manage ordered date and date-time choices safely across DST.

Source:
US-02, US-03; approved date/time decision

Acceptance criteria:
- The owner can add, edit, reorder, and remove choices in Draft.
- Date-only choices retain a local ISO date; timed choices retain UTC instant, IANA zone, and selected UTC offset.
- Duplicate/invalid choices and nonexistent local times are rejected; ambiguous local times require explicit offset selection.
- Property, contract, and browser tests cover ordering, duplicates, DST gaps, and DST folds.

Design authority:
- For any user-facing UI this story creates, changes, serves, or verifies, `.docs/design/README.md` and `.docs/design/Gather Prototype.dc.html` are the primary sources for layout, copy, states, flows, responsive behavior, and Modernist tokens; use the chosen "1b — ranking-first" direction from `Poll Wireframes.dc.html` where applicable.
- Requirements and acceptance use cases remain the functional source of truth when behavior or validation limits conflict with the prototype, and the prototype-only black control bar must not be implemented.
- Acceptance evidence for UI-bearing work must cover applicable design hierarchy, copy, interaction states, accessibility, and responsive behavior, reusing the foundation established by S-032 rather than introducing a competing visual system.