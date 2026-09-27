---
id: T-061
type: task
title: Implement and verify test-gated release automation
parent: S-029
status: todo
dependsOn: [T-060]
estimate: 2
tags: [ci-cd, deployment, green, implementation]
archived: false
created: 2026-09-27T18:09:21.404Z
updated: 2026-09-27T18:19:39.508Z
---
Implementation scope:
Implement locked installation, complete test gates, esbuild ZIP and Vite packaging, configuration validation, CDK synth/deploy, Lambda alias update, asset upload, scoped CloudFront invalidation, and failure diagnostics.

Acceptance criteria:
- No deploy occurs after a failed gate and dry-run tests prove the required order.
- Lambda/frontend artifacts are reproducible and contain no secrets or local-auth code.
- Environment, account, region, domain, and alarm destination are explicit.
- Red tests plus relevant regression/security checks are green; rollback metadata and commands/results are attached.