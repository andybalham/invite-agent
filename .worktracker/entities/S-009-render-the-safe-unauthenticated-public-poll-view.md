---
id: S-009
type: story
title: Render the safe unauthenticated public poll view
parent: E-003
dependsOn: [S-008]
estimate: 3
tags: [accessibility, design, design-authority, e2e, public-ui]
archived: false
created: 2026-09-27T18:06:59.336Z
updated: 2026-09-28T18:20:21.102Z
---
Outcome:
Render the safe unauthenticated public poll view.

Source:
US-06, US-07, US-08, US-35

Acceptance criteria:
- A fresh unauthenticated context can open the active link without account or password.
- The page shows poll details, sanitised location, ordered choices, lifecycle state, and the collaborative-sharing notice.
- Drafts, organiser identity, audit data, raw stored hashes, and management controls are never disclosed.
- Unknown links receive 404 and recognised revoked links receive 410 with non-sensitive accessible messaging.

Design authority:
- For any user-facing UI this story creates, changes, serves, or verifies, `.docs/design/README.md` and `.docs/design/Gather Prototype.dc.html` are the primary sources for layout, copy, states, flows, responsive behavior, and Modernist tokens; use the chosen "1b — ranking-first" direction from `Poll Wireframes.dc.html` where applicable.
- Requirements and acceptance use cases remain the functional source of truth when behavior or validation limits conflict with the prototype, and the prototype-only black control bar must not be implemented.
- Acceptance evidence for UI-bearing work must cover applicable design hierarchy, copy, interaction states, accessibility, and responsive behavior, reusing the foundation established by S-032 rather than introducing a competing visual system.