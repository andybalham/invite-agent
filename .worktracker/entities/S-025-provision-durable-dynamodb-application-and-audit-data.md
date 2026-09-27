---
id: S-025
type: story
title: Provision durable DynamoDB application and audit data
parent: E-008
dependsOn: [S-024]
estimate: 3
tags: [aws, cdk, dynamodb, infrastructure-test]
archived: false
created: 2026-09-27T18:07:00.625Z
updated: 2026-09-27T18:07:00.625Z
---
Outcome:
Provision durable DynamoDB application and audit data.

Source:
Architecture §§5.5, 9, 15

Acceptance criteria:
- CDK provisions separate encrypted on-demand app and audit tables with required keys/indexes and point-in-time recovery.
- Production removal/retention policies protect current and append-only audit data.
- The deployed schema supports owner listing, active-token lookup, name locks, transactional mutations, ordered history, and frozen ranking.
- CDK assertions and DynamoDB Local parity tests verify the schema and permissions.