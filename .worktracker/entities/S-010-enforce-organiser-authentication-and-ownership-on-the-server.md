---
id: S-010
type: story
title: Enforce organiser authentication and ownership on the server
parent: E-003
dependsOn: [S-008]
estimate: 3
tags: [authorization, contract-test, design-authority, ownership, security]
archived: false
created: 2026-09-27T18:06:59.422Z
updated: 2026-09-28T18:20:21.148Z
---
Outcome:
Enforce organiser authentication and ownership on the server.

Source:
US-31, US-32; architecture §§5.4, 11

Acceptance criteria:
- Every organiser endpoint derives identity from verified context and ignores any body-supplied owner ID.
- Unauthenticated access returns 401; an authenticated non-owner receives 403; rejected calls change no data or audit history.
- Public capability holders cannot invoke organiser operations.
- Contract tests cover every organiser route and local auth cannot be enabled by the production composition.

Design authority:
- For any user-facing UI this story creates, changes, serves, or verifies, `.docs/design/README.md` and `.docs/design/Gather Prototype.dc.html` are the primary sources for layout, copy, states, flows, responsive behavior, and Modernist tokens; use the chosen "1b — ranking-first" direction from `Poll Wireframes.dc.html` where applicable.
- Requirements and acceptance use cases remain the functional source of truth when behavior or validation limits conflict with the prototype, and the prototype-only black control bar must not be implemented.
- Acceptance evidence for UI-bearing work must cover applicable design hierarchy, copy, interaction states, accessibility, and responsive behavior, reusing the foundation established by S-032 rather than introducing a competing visual system.