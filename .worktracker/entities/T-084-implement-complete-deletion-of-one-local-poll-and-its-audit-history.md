---
id: T-084
type: task
title: Implement complete deletion of one local poll and its audit history
parent: S-038
status: todo
dependsOn: [T-083]
tags: [cleanup, dynamodb]
archived: false
created: 2026-10-03T10:16:13.130Z
updated: 2026-10-03T10:16:13.130Z
---
Implement a local-only utility that deletes an explicitly named poll's metadata, participant rows, name indexes, public-token capability, and all audit events using paginated queries and bounded batch writes. Verify the target and endpoint before mutation.