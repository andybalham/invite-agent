---
id: S-029
type: story
title: Automate test-gated packaging and deployment
parent: E-009
dependsOn: [S-027, S-028]
estimate: 3
tags: [build, ci-cd, deployment, design-authority, testing]
archived: false
created: 2026-09-27T18:07:00.921Z
updated: 2026-09-28T18:20:22.227Z
---
Outcome:
Automate test-gated packaging and deployment.

Source:
Architecture §15.1–15.2, §16.7

Acceptance criteria:
- A single release workflow installs locked dependencies and runs every local quality/test layer before synth or deploy.
- esbuild produces reproducible source-mapped Lambda ZIPs without ECR; Vite produces hashed frontend assets.
- CDK synth/security checks gate deployment; environment/account/region/domain/alarm configuration is explicit.
- Deployment uploads assets, updates Lambda aliases, invalidates only mutable CloudFront paths, and fails safely with retained diagnostics.

Design authority:
- For any user-facing UI this story creates, changes, serves, or verifies, `.docs/design/README.md` and `.docs/design/Gather Prototype.dc.html` are the primary sources for layout, copy, states, flows, responsive behavior, and Modernist tokens; use the chosen "1b — ranking-first" direction from `Poll Wireframes.dc.html` where applicable.
- Requirements and acceptance use cases remain the functional source of truth when behavior or validation limits conflict with the prototype, and the prototype-only black control bar must not be implemented.
- Acceptance evidence for UI-bearing work must cover applicable design hierarchy, copy, interaction states, accessibility, and responsive behavior, reusing the foundation established by S-032 rather than introducing a competing visual system.