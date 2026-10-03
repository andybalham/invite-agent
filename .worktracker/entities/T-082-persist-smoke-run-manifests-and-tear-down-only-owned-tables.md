---
id: T-082
type: task
title: Persist smoke-run manifests and tear down only owned tables
parent: S-037
status: todo
dependsOn: [T-081]
tags: [cleanup, dynamodb, smoke-test]
archived: false
created: 2026-10-03T10:16:12.974Z
updated: 2026-10-03T10:16:12.974Z
---
Record every poll ID created by the smoke journey and implement finally-path cleanup that deletes only the run-owned tables after the stack stops, preserving unrelated local tables and data even after test failure.