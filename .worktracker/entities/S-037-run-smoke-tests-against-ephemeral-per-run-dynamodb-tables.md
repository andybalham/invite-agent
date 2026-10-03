---
id: S-037
type: story
title: Run smoke tests against ephemeral per-run DynamoDB tables
parent: E-011
dependsOn: []
tags: [dynamodb, isolation, smoke-test]
archived: false
created: 2026-10-03T10:15:58.039Z
updated: 2026-10-03T10:15:58.039Z
---
Make each future smoke invocation own unique application and audit tables, record its run identity and created poll IDs, and clean up only resources created by that invocation while preserving unrelated local development data.