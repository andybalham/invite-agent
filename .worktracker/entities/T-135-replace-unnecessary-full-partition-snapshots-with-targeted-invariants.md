---
id: T-135
type: task
title: Replace unnecessary full-partition snapshots with targeted invariants
parent: S-052
status: done
dependsOn: [T-134]
estimate: 3
tags: [dynamodb, e2e, performance]
archived: false
created: 2026-10-05T18:50:36.127Z
updated: 2026-10-07T19:18:07.855Z
---
Reduce consistent reads and full app/audit partition snapshots in discovery tests; keep complete immutable-history checks in dedicated integrity coverage.