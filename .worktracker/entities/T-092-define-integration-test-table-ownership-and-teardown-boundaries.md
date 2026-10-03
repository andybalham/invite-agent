---
id: T-092
type: task
title: Define integration-test table ownership and teardown boundaries
parent: S-041
status: todo
dependsOn: []
tags: [cleanup, dynamodb, integration-tests]
archived: false
created: 2026-10-03T10:51:46.673Z
updated: 2026-10-03T10:51:46.673Z
---
Inventory integration-test fixtures and their application/audit table creation paths. Define the per-test ownership record, teardown ordering, idempotence requirements, and how cleanup failures preserve the original test failure.