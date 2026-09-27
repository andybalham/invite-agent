---
id: S-029
type: story
title: Automate test-gated packaging and deployment
parent: E-009
dependsOn: [S-027, S-028]
estimate: 3
tags: [build, ci-cd, deployment, testing]
archived: false
created: 2026-09-27T18:07:00.921Z
updated: 2026-09-27T18:07:00.921Z
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