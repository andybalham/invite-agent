---
id: S-022
type: story
title: Enforce closed read-only state and frozen ranking
parent: E-007
dependsOn: [S-021]
estimate: 3
tags: [authorization, closed-state, design, design-authority, e2e, ranking]
archived: false
created: 2026-09-27T18:07:00.408Z
updated: 2026-09-28T18:20:21.830Z
---
Outcome:
Enforce closed read-only state and frozen ranking.

Source:
US-26, US-27

Acceptance criteria:
- The public page prominently displays the selected date and closing-time ranking, with the result primary even if not ranked first.
- Participant and proposed-date editing controls are unavailable while Closed.
- Direct public participant and organiser date mutations are rejected with 422 and no change to data, totals, ranking, or audit history.
- Reloads and fresh contexts see the same frozen result.

Design authority:
- For any user-facing UI this story creates, changes, serves, or verifies, `.docs/design/README.md` and `.docs/design/Gather Prototype.dc.html` are the primary sources for layout, copy, states, flows, responsive behavior, and Modernist tokens; use the chosen "1b — ranking-first" direction from `Poll Wireframes.dc.html` where applicable.
- Requirements and acceptance use cases remain the functional source of truth when behavior or validation limits conflict with the prototype, and the prototype-only black control bar must not be implemented.
- Acceptance evidence for UI-bearing work must cover applicable design hierarchy, copy, interaction states, accessibility, and responsive behavior, reusing the foundation established by S-032 rather than introducing a competing visual system.