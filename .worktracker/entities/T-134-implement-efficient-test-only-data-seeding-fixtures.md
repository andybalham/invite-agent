---
id: T-134
type: task
title: Implement efficient test-only data seeding fixtures
parent: S-052
status: todo
dependsOn: [T-130]
estimate: 4
tags: [e2e, fixtures, performance]
archived: false
created: 2026-10-05T18:50:36.043Z
updated: 2026-10-05T18:50:36.043Z
---
Add deterministic repository or SDK-backed seed helpers for datasets where HTTP creation is not the behaviour under test, while retaining HTTP creation coverage in focused tests.