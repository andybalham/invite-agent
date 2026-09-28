---
id: S-011
type: story
title: View responses and add a validated participant row
parent: E-004
dependsOn: [S-009]
estimate: 4
tags: [design, design-authority, e2e, participants, validation]
archived: false
created: 2026-09-27T18:06:59.508Z
updated: 2026-09-28T18:20:21.206Z
---
Outcome:
View responses and add a validated participant row.

Source:
US-08–US-11

Acceptance criteria:
- The open public table displays every participant and every Yes/No value.
- Adding a trimmed non-empty name of at most 100 Unicode code points creates one row with all cells No and one anonymous audit revision.
- Internal whitespace is preserved; uniqueness uses NFKC plus locale-independent case folding.
- Blank, excessive, canonically/case-equivalent duplicate names and non-Yes/No values are rejected with no state or audit change.

Design authority:
- For any user-facing UI this story creates, changes, serves, or verifies, `.docs/design/README.md` and `.docs/design/Gather Prototype.dc.html` are the primary sources for layout, copy, states, flows, responsive behavior, and Modernist tokens; use the chosen "1b — ranking-first" direction from `Poll Wireframes.dc.html` where applicable.
- Requirements and acceptance use cases remain the functional source of truth when behavior or validation limits conflict with the prototype, and the prototype-only black control bar must not be implemented.
- Acceptance evidence for UI-bearing work must cover applicable design hierarchy, copy, interaction states, accessibility, and responsive behavior, reusing the foundation established by S-032 rather than introducing a competing visual system.