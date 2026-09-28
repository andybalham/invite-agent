---
id: S-017
type: story
title: Persist and display complete immutable audit history
parent: E-006
dependsOn: [S-016]
estimate: 3
tags: [audit, design, design-authority, e2e, history, integration]
archived: false
created: 2026-09-27T18:07:00.002Z
updated: 2026-09-28T18:20:21.544Z
---
Outcome:
Persist and display complete immutable audit history.

Source:
US-20; requirements §8

Acceptance criteria:
- Each successful poll, date, participant, location, link, and lifecycle mutation appends exactly one immutable event unless an explicitly atomic compound action specifies one.
- Events record entity, action, before/after domain values, server time, actor category, and organiser subject where applicable.
- History is paged newest first for the owner and renders meaningful changes.
- Tests prove tokens, credentials, cookies, sessions, authorization headers, and full sensitive request bodies are absent.

Design authority:
- For any user-facing UI this story creates, changes, serves, or verifies, `.docs/design/README.md` and `.docs/design/Gather Prototype.dc.html` are the primary sources for layout, copy, states, flows, responsive behavior, and Modernist tokens; use the chosen "1b — ranking-first" direction from `Poll Wireframes.dc.html` where applicable.
- Requirements and acceptance use cases remain the functional source of truth when behavior or validation limits conflict with the prototype, and the prototype-only black control bar must not be implemented.
- Acceptance evidence for UI-bearing work must cover applicable design hierarchy, copy, interaction states, accessibility, and responsive behavior, reusing the foundation established by S-032 rather than introducing a competing visual system.