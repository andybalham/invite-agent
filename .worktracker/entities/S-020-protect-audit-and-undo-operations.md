---
id: S-020
type: story
title: Protect audit and undo operations
parent: E-006
dependsOn: [S-010, S-017]
estimate: 2
tags: [audit, authorization, contract-test, design-authority]
archived: false
created: 2026-09-27T18:07:00.238Z
updated: 2026-09-28T18:20:21.706Z
---
Outcome:
Protect audit and undo operations.

Source:
US-23, US-31, US-32

Acceptance criteria:
- Public link holders cannot read history, preview undo, or execute undo.
- Authenticated non-owners cannot access another owner's history or undo controls.
- Rejected requests reveal no event content and change neither current state nor history.
- Direct API tests assert 401/403 semantics across all audit routes.

Design authority:
- For any user-facing UI this story creates, changes, serves, or verifies, `.docs/design/README.md` and `.docs/design/Gather Prototype.dc.html` are the primary sources for layout, copy, states, flows, responsive behavior, and Modernist tokens; use the chosen "1b — ranking-first" direction from `Poll Wireframes.dc.html` where applicable.
- Requirements and acceptance use cases remain the functional source of truth when behavior or validation limits conflict with the prototype, and the prototype-only black control bar must not be implemented.
- Acceptance evidence for UI-bearing work must cover applicable design hierarchy, copy, interaction states, accessibility, and responsive behavior, reusing the foundation established by S-032 rather than introducing a competing visual system.