---
id: S-013
type: story
title: Toggle Yes/No cells accessibly with autosave and totals
parent: E-004
dependsOn: [S-011]
estimate: 4
tags: [accessibility, autosave, availability, design, design-authority, e2e]
archived: false
created: 2026-09-27T18:06:59.669Z
updated: 2026-09-28T18:20:21.318Z
---
Outcome:
Toggle Yes/No cells accessibly with autosave and totals.

Source:
US-12, US-15

Acceptance criteria:
- Every availability cell is keyboard focusable and communicates participant, date, and current Yes/No state.
- Click and Space each toggle a cell, send one automatic update, and require no Save action.
- The latest server representation replaces displayed state after each accepted mutation.
- Yes totals exclude No and update visibly; each success creates one correctly attributed audit revision.

Design authority:
- For any user-facing UI this story creates, changes, serves, or verifies, `.docs/design/README.md` and `.docs/design/Gather Prototype.dc.html` are the primary sources for layout, copy, states, flows, responsive behavior, and Modernist tokens; use the chosen "1b — ranking-first" direction from `Poll Wireframes.dc.html` where applicable.
- Requirements and acceptance use cases remain the functional source of truth when behavior or validation limits conflict with the prototype, and the prototype-only black control bar must not be implemented.
- Acceptance evidence for UI-bearing work must cover applicable design hierarchy, copy, interaction states, accessibility, and responsive behavior, reusing the foundation established by S-032 rather than introducing a competing visual system.