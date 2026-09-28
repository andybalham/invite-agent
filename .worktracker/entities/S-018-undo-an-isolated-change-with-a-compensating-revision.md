---
id: S-018
type: story
title: Undo an isolated change with a compensating revision
parent: E-006
dependsOn: [S-017]
estimate: 3
tags: [audit, design, design-authority, domain, e2e, undo]
archived: false
created: 2026-09-27T18:07:00.085Z
updated: 2026-09-28T18:20:21.596Z
---
Outcome:
Undo an isolated change with a compensating revision.

Source:
US-21

Acceptance criteria:
- The owner can preview and confirm inversion of a reversible event with no later overlap.
- Undo restores prior state, recomputes totals and live ranking, and leaves the original event unchanged.
- Exactly one newer UNDO event references the original and records restored before/after values.
- Domain, repository, contract, and browser tests cover update, add, and delete inversions.

Design authority:
- For any user-facing UI this story creates, changes, serves, or verifies, `.docs/design/README.md` and `.docs/design/Gather Prototype.dc.html` are the primary sources for layout, copy, states, flows, responsive behavior, and Modernist tokens; use the chosen "1b — ranking-first" direction from `Poll Wireframes.dc.html` where applicable.
- Requirements and acceptance use cases remain the functional source of truth when behavior or validation limits conflict with the prototype, and the prototype-only black control bar must not be implemented.
- Acceptance evidence for UI-bearing work must cover applicable design hierarchy, copy, interaction states, accessibility, and responsive behavior, reusing the foundation established by S-032 rather than introducing a competing visual system.