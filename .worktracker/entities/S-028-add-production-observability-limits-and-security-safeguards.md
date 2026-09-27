---
id: S-028
type: story
title: "Add production observability, limits, and security safeguards"
parent: E-008
dependsOn: [S-026]
estimate: 3
tags: [cloudwatch, observability, operations, security]
archived: false
created: 2026-09-27T18:07:00.844Z
updated: 2026-09-27T18:07:00.844Z
---
Outcome:
Add production observability, limits, and security safeguards.

Source:
Architecture §§11–13

Acceptance criteria:
- Structured logs include correlation, route, status, latency, actor category, poll ID, version, and error code while excluding sensitive bodies/tokens.
- Explicit log retention, encryption, concurrency/cost limits, API throttles, and bounded poll sizes are configured.
- Dashboards and alarms cover API, Lambda, DynamoDB, CloudFront, Cognito aggregates, and synthetic health; alarms publish to a required SNS destination.
- Infrastructure tests verify security headers, encryption, least privilege, retention, alarms, and the absence of public S3 access.