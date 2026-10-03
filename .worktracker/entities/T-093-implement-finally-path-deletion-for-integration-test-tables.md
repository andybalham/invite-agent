---
id: T-093
type: task
title: Implement finally-path deletion for integration-test tables
parent: S-041
status: todo
dependsOn: [T-092]
tags: [cleanup, dynamodb, integration-tests]
archived: false
created: 2026-10-03T10:51:46.755Z
updated: 2026-10-03T10:51:46.755Z
---
Update integration-test fixtures or shared helpers so every uniquely created application and audit table is deleted after each test, including assertion and setup failures. Preserve unrelated local tables and avoid deleting shared development or smoke-run tables.