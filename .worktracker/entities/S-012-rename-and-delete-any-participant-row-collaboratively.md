---
id: S-012
type: story
title: Rename and delete any participant row collaboratively
parent: E-004
dependsOn: [S-011]
estimate: 3
tags: [collaboration, design, design-authority, e2e, participants]
archived: false
created: 2026-09-27T18:06:59.590Z
updated: 2026-09-28T18:20:21.259Z
---
Outcome:
Rename and delete any participant row collaboratively.

Source:
US-13, US-14

Acceptance criteria:
- Any active link holder can rename any row to a valid unique name without changing responses.
- A duplicate rename is rejected under the same normalized uniqueness rule and creates no audit event.
- Deletion requires the entered confirmation to equal the current display name exactly; mismatch leaves all state unchanged.
- Successful rename/delete autosaves, refreshes the latest table, recalculates totals, and creates exactly one audit revision.

Design authority:
- For any user-facing UI this story creates, changes, serves, or verifies, `.docs/design/README.md` and `.docs/design/Gather Prototype.dc.html` are the primary sources for layout, copy, states, flows, responsive behavior, and Modernist tokens; use the chosen "1b — ranking-first" direction from `Poll Wireframes.dc.html` where applicable.
- Requirements and acceptance use cases remain the functional source of truth when behavior or validation limits conflict with the prototype, and the prototype-only black control bar must not be implemented.
- Acceptance evidence for UI-bearing work must cover applicable design hierarchy, copy, interaction states, accessibility, and responsive behavior, reusing the foundation established by S-032 rather than introducing a competing visual system.