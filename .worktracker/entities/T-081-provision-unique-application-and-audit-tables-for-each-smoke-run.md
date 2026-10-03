---
id: T-081
type: task
title: Provision unique application and audit tables for each smoke run
parent: S-037
status: done
dependsOn: [T-080]
tags: [dynamodb, smoke-test]
archived: false
created: 2026-10-03T10:16:12.894Z
updated: 2026-10-03T10:39:20.586Z
---
Update the smoke harness and local startup integration to create or initialize unique per-run DynamoDB application and audit tables, pass their names to the API, and retain the run ID and table names in evidence.