---
id: S-030
type: story
title: Prove the deployed critical journey with production smoke tests
parent: E-009
dependsOn: [S-029]
estimate: 3
tags: [cognito, design, design-authority, e2e, production, smoke-test]
archived: false
created: 2026-09-27T18:07:01.004Z
updated: 2026-09-28T18:20:22.282Z
---
Outcome:
Prove the deployed critical journey with production smoke tests.

Source:
Architecture §§15.2, 16.8

Acceptance criteria:
- Automated smoke checks verify DNS, TLS, security headers, SPA deep links, private-origin delivery, and /api routing.
- A real invited Cognito organiser signs in, creates and publishes a disposable poll, and a fresh unauthenticated context reads and updates it.
- The organiser observes audit history, closes the poll, verifies the public result, and removes or marks disposable data according to the runbook.
- Failures collect correlation IDs and diagnostics without printing credentials or raw link tokens.

Design authority:
- For any user-facing UI this story creates, changes, serves, or verifies, `.docs/design/README.md` and `.docs/design/Gather Prototype.dc.html` are the primary sources for layout, copy, states, flows, responsive behavior, and Modernist tokens; use the chosen "1b — ranking-first" direction from `Poll Wireframes.dc.html` where applicable.
- Requirements and acceptance use cases remain the functional source of truth when behavior or validation limits conflict with the prototype, and the prototype-only black control bar must not be implemented.
- Acceptance evidence for UI-bearing work must cover applicable design hierarchy, copy, interaction states, accessibility, and responsive behavior, reusing the foundation established by S-032 rather than introducing a competing visual system.