---
id: T-086
type: task
title: Verify repeated smoke runs use isolated tables and leave no owned data
parent: S-039
status: todo
dependsOn: [T-082, T-085]
tags: [smoke-test, testing]
archived: false
created: 2026-10-03T10:16:13.282Z
updated: 2026-10-03T10:16:13.282Z
---
Run the smoke command repeatedly and confirm each run receives unique table names and run IDs, successful teardown removes those tables, unrelated local tables remain, and failure paths still perform owned-resource cleanup.