---
id: S-015
type: story
title: Calculate deterministic top-five rankings
parent: E-005
dependsOn: [S-013]
estimate: 2
tags: [design-authority, domain, property-test, ranking]
archived: false
created: 2026-09-27T18:06:59.833Z
updated: 2026-09-28T18:20:21.439Z
---
Outcome:
Calculate deterministic top-five rankings.

Source:
US-17, US-18

Acceptance criteria:
- Ranking sorts by Yes total descending and original proposed-date order for all ties.
- No totals and participant ordering never affect the result.
- The result contains at most five entries and includes all choices when fewer than five exist.
- Property tests cover arbitrary response matrices, stable ties, limits, and deterministic output.

Design authority:
- For any user-facing UI this story creates, changes, serves, or verifies, `.docs/design/README.md` and `.docs/design/Gather Prototype.dc.html` are the primary sources for layout, copy, states, flows, responsive behavior, and Modernist tokens; use the chosen "1b — ranking-first" direction from `Poll Wireframes.dc.html` where applicable.
- Requirements and acceptance use cases remain the functional source of truth when behavior or validation limits conflict with the prototype, and the prototype-only black control bar must not be implemented.
- Acceptance evidence for UI-bearing work must cover applicable design hierarchy, copy, interaction states, accessibility, and responsive behavior, reusing the foundation established by S-032 rather than introducing a competing visual system.