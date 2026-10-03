---
id: T-085
type: task
title: Implement smoke-run clear-down by run manifest
parent: S-038
status: done
dependsOn: [T-084]
tags: [cleanup, smoke-test]
archived: false
created: 2026-10-03T10:16:13.205Z
updated: 2026-10-03T14:26:22.936Z
---
Add run-ID cleanup that reads the smoke-run manifest, previews every poll and table target, requires explicit confirmation, deletes all associated polls completely, and reports unresolved or already-missing resources without broad table scans.