---
id: E-009
type: epic
title: "E9 — Tested production release and operations"
parent: null
dependsOn: [E-008]
estimate: 8
tags: [ci-cd, deployment, operations, production, smoke-test]
archived: false
created: 2026-09-27T18:05:21.916Z
updated: 2026-09-27T18:05:21.916Z
---
Visible deliverable:
Invite-a-Gent is deployed at https://invite-agent.10printiamcool.com and a repeatable release pipeline proves the critical organiser and participant journey while providing rollback and operational guidance.

Acceptance criteria:
- The release pipeline runs formatting, linting, unit/property, DynamoDB integration, API contract, frontend, Playwright, CDK, and security checks before deployment.
- Lambda functions are reproducible Node.js 22 ZIP assets; frontend assets are versioned and only mutable CloudFront paths are invalidated.
- Environment configuration is explicit and secrets/tokens are absent from source, build logs, and audit data.
- A deployed smoke suite verifies DNS/TLS, SPA routing, private S3 delivery, API Gateway/Lambda, real Cognito sign-in, data persistence, link access, and a disposable poll lifecycle.
- CloudWatch alarms reach a configured SNS destination and dashboards expose the documented service signals.
- Deployment and rollback runbooks are tested, including Lambda alias rollback and backward-compatible data changes.
- Production acceptance evidence is recorded and the complete MVP traceability matrix is green.