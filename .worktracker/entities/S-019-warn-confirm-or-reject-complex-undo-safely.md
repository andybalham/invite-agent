---
id: S-019
type: story
title: "Warn, confirm, or reject complex undo safely"
parent: E-006
dependsOn: [S-018]
estimate: 3
tags: [design, design-authority, e2e, safety, undo]
archived: false
created: 2026-09-27T18:07:00.160Z
updated: 2026-09-28T18:20:21.645Z
---
Outcome:
Warn, confirm, or reject complex undo safely.

Source:
US-22; approved undo decision

Acceptance criteria:
- A selected event whose value changed later returns a preview identifying the overwrite risk.
- Cancellation changes nothing; explicit confirmation restores the selected event's documented prior value and appends one undo event.
- An undo that would violate current structural invariants is rejected atomically with an actionable error and no audit event.
- Tests cover newer overlapping values, unrelated later work, invalid structure, and derived ranking recalculation.

Design authority:
- For any user-facing UI this story creates, changes, serves, or verifies, `.docs/design/README.md` and `.docs/design/Gather Prototype.dc.html` are the primary sources for layout, copy, states, flows, responsive behavior, and Modernist tokens; use the chosen "1b — ranking-first" direction from `Poll Wireframes.dc.html` where applicable.
- Requirements and acceptance use cases remain the functional source of truth when behavior or validation limits conflict with the prototype, and the prototype-only black control bar must not be implemented.
- Acceptance evidence for UI-bearing work must cover applicable design hierarchy, copy, interaction states, accessibility, and responsive behavior, reusing the foundation established by S-032 rather than introducing a competing visual system.