---
id: S-002
type: story
title: Run shared services locally with DynamoDB and guarded authentication
parent: E-001
dependsOn: [S-001]
estimate: 3
tags: [backend, dynamodb, integration, local-auth]
archived: false
created: 2026-09-27T18:06:58.766Z
updated: 2026-09-27T18:06:58.766Z
---
Outcome:
Run shared services locally with DynamoDB and guarded authentication.

Source:
Architecture §§16.1–16.5

Acceptance criteria:
- DynamoDB Local starts with deterministic app/audit table initialization and isolated test table names.
- The local HTTP adapter invokes the same services, repositories, validation, authorization policies, and error mapping as Lambda handlers.
- Local authentication is deterministic, restricted to local/test modes, and absent from production composition.
- Repository and API health integration tests pass without AWS credentials.