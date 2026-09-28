---
id: S-008
type: story
title: Publish atomically and issue a secure public capability
parent: E-003
dependsOn: [S-007]
estimate: 3
tags: [audit, design, design-authority, publishing, security, token]
archived: false
created: 2026-09-27T18:06:59.251Z
updated: 2026-09-28T18:20:21.039Z
---
Outcome:
Publish atomically and issue a secure public capability.

Source:
US-06; requirements §11; architecture §7

Acceptance criteria:
- Publishing a valid Draft atomically sets Open, stores only a keyed token hash, and appends one audit revision.
- The raw token contains exactly 192 cryptographically random bits encoded as Base64URL and is returned only where needed to form/copy the link.
- Sequential, malformed, reused, or absent tokens do not resolve a poll.
- Unit randomness/format checks, repository transaction tests, and API contract tests pass.

Design authority:
- For any user-facing UI this story creates, changes, serves, or verifies, `.docs/design/README.md` and `.docs/design/Gather Prototype.dc.html` are the primary sources for layout, copy, states, flows, responsive behavior, and Modernist tokens; use the chosen "1b — ranking-first" direction from `Poll Wireframes.dc.html` where applicable.
- Requirements and acceptance use cases remain the functional source of truth when behavior or validation limits conflict with the prototype, and the prototype-only black control bar must not be implemented.
- Acceptance evidence for UI-bearing work must cover applicable design hierarchy, copy, interaction states, accessibility, and responsive behavior, reusing the foundation established by S-032 rather than introducing a competing visual system.