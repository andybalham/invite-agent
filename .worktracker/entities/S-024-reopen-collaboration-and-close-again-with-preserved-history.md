---
id: S-024
type: story
title: Reopen collaboration and close again with preserved history
parent: E-007
dependsOn: [S-022, S-023]
estimate: 3
tags: [audit, design, design-authority, e2e, lifecycle, reopening]
archived: false
created: 2026-09-27T18:07:00.556Z
updated: 2026-09-28T18:20:21.932Z
---
Outcome:
Reopen collaboration and close again with preserved history.

Source:
US-28–US-30

Acceptance criteria:
- Reopen requires explicit confirmation; cancellation changes nothing.
- Confirmation sets Open, marks the prior selection provisional, restores participant editing and live ranking, and appends one reopen event.
- The organiser can close again with the same or another date, producing a new atomic close event and frozen ranking.
- History preserves the earlier close, reopen, and later close as distinct revisions.

Design authority:
- For any user-facing UI this story creates, changes, serves, or verifies, `.docs/design/README.md` and `.docs/design/Gather Prototype.dc.html` are the primary sources for layout, copy, states, flows, responsive behavior, and Modernist tokens; use the chosen "1b — ranking-first" direction from `Poll Wireframes.dc.html` where applicable.
- Requirements and acceptance use cases remain the functional source of truth when behavior or validation limits conflict with the prototype, and the prototype-only black control bar must not be implemented.
- Acceptance evidence for UI-bearing work must cover applicable design hierarchy, copy, interaction states, accessibility, and responsive behavior, reusing the foundation established by S-032 rather than introducing a competing visual system.