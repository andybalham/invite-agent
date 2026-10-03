---
id: E-008
type: epic
title: "E8 — Production AWS platform"
parent: null
dependsOn: [E-007, E-010]
estimate: 12
tags: [aws, cdk, infrastructure, production, security]
archived: false
created: 2026-09-27T18:05:21.827Z
updated: 2026-10-03T09:02:55.916Z
---
Visible deliverable:
A CDK deployment provisions a production-like Invite-a-Gent environment with private web hosting, authenticated organiser APIs, public poll APIs, durable audited data, vanity-domain HTTPS, and operational safeguards.

Acceptance criteria:
- Separate CDK constructs/stacks provision DynamoDB, Cognito, Lambda ZIPs, API Gateway, private S3, CloudFront, Route 53, ACM, and monitoring in the documented regions.
- Least-privilege IAM separates organiser and public functions.
- CloudFront serves the SPA, routes /api/* without caching, rewrites only recognised client routes, and keeps S3 private through OAC.
- Cognito Authorization Code with PKCE protects organiser routes and cannot enable local auth in production.
- Tables use on-demand capacity, encryption, point-in-time recovery, and appropriate retention/removal policies.
- Security headers, throttling, structured logs, alarms, and explicit retention are configured.
- CDK assertion/snapshot and bundle execution tests pass before deployment.