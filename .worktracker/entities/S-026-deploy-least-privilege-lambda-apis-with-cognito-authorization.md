---
id: S-026
type: story
title: Deploy least-privilege Lambda APIs with Cognito authorization
parent: E-008
dependsOn: [S-025]
estimate: 3
tags: [api-gateway, aws, cognito, design-authority, lambda, security]
archived: false
created: 2026-09-27T18:07:00.698Z
updated: 2026-09-28T18:20:22.051Z
---
Outcome:
Deploy least-privilege Lambda APIs with Cognito authorization.

Source:
Architecture §§5.2–5.4, 8, 11

Acceptance criteria:
- Node.js 22 organiser and public handlers are reproducible ARM64 ZIPs with distinct least-privilege roles.
- API Gateway exposes /api/v1, applies JWT authorization only to organiser routes, validates/throttles requests, and propagates correlation IDs.
- Cognito disables self-registration and uses a browser client without secret plus Authorization Code/PKCE and approved callbacks.
- CDK and bundle smoke tests prove local auth code is absent and IAM/table/index access is scoped.

Design authority:
- For any user-facing UI this story creates, changes, serves, or verifies, `.docs/design/README.md` and `.docs/design/Gather Prototype.dc.html` are the primary sources for layout, copy, states, flows, responsive behavior, and Modernist tokens; use the chosen "1b — ranking-first" direction from `Poll Wireframes.dc.html` where applicable.
- Requirements and acceptance use cases remain the functional source of truth when behavior or validation limits conflict with the prototype, and the prototype-only black control bar must not be implemented.
- Acceptance evidence for UI-bearing work must cover applicable design hierarchy, copy, interaction states, accessibility, and responsive behavior, reusing the foundation established by S-032 rather than introducing a competing visual system.