---
id: S-014
type: story
title: Apply concurrent edits with last-update-wins convergence
parent: E-004
dependsOn: [S-013]
estimate: 4
tags: [concurrency, design, design-authority, e2e, integration, last-update-wins]
archived: false
created: 2026-09-27T18:06:59.751Z
updated: 2026-09-28T18:20:21.383Z
---
Outcome:
Apply concurrent edits with last-update-wins convergence.

Source:
US-16; architecture §§5.1, 9

Acceptance criteria:
- Mutation requests contain no expected-version precondition and overlapping accepted writes produce no conflict warning.
- Internal transaction contention is retried against current state within a bounded policy.
- The last successfully committed overlapping value is the stored value and each accepted mutation has a separate audit revision.
- Controlled two-context integration and Playwright tests prove both clients converge when they observe the newer version.

Design authority:
- For any user-facing UI this story creates, changes, serves, or verifies, `.docs/design/README.md` and `.docs/design/Gather Prototype.dc.html` are the primary sources for layout, copy, states, flows, responsive behavior, and Modernist tokens; use the chosen "1b — ranking-first" direction from `Poll Wireframes.dc.html` where applicable.
- Requirements and acceptance use cases remain the functional source of truth when behavior or validation limits conflict with the prototype, and the prototype-only black control bar must not be implemented.
- Acceptance evidence for UI-bearing work must cover applicable design hierarchy, copy, interaction states, accessibility, and responsive behavior, reusing the foundation established by S-032 rather than introducing a competing visual system.