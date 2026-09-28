---
id: S-007
type: story
title: Preview a private draft and enforce publication readiness
parent: E-002
dependsOn: [S-005, S-006]
estimate: 2
tags: [design, design-authority, e2e, preview, publication]
archived: false
created: 2026-09-27T18:06:59.172Z
updated: 2026-09-28T18:20:20.981Z
---
Outcome:
Preview a private draft and enforce publication readiness.

Source:
US-04, US-05, US-07

Acceptance criteria:
- Preview displays details, safe location, configured time zone, and ordered choices as participants will see them.
- Preview remains Draft, exposes no working public capability, and accepts no participant response.
- Publish controls identify every blocking field and remain unavailable until validation succeeds.
- Playwright and direct API tests prove invalid drafts remain private and unchanged.

Design authority:
- For any user-facing UI this story creates, changes, serves, or verifies, `.docs/design/README.md` and `.docs/design/Gather Prototype.dc.html` are the primary sources for layout, copy, states, flows, responsive behavior, and Modernist tokens; use the chosen "1b — ranking-first" direction from `Poll Wireframes.dc.html` where applicable.
- Requirements and acceptance use cases remain the functional source of truth when behavior or validation limits conflict with the prototype, and the prototype-only black control bar must not be implemented.
- Acceptance evidence for UI-bearing work must cover applicable design hierarchy, copy, interaction states, accessibility, and responsive behavior, reusing the foundation established by S-032 rather than introducing a competing visual system.