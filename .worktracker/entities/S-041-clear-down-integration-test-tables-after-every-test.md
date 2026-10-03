---
id: S-041
type: story
title: Clear down integration-test tables after every test
parent: E-011
dependsOn: []
tags: [cleanup, dynamodb, integration-tests, testing]
archived: false
created: 2026-10-03T10:51:10.151Z
updated: 2026-10-03T10:51:10.151Z
---
Ensure each integration test or test fixture deletes the uniquely created application and audit tables after the test, including when assertions fail. Cleanup must be idempotent, preserve unrelated local tables, report cleanup failures without hiding the original test failure, and leave no accumulated invite-agent-test-* tables after the suite.