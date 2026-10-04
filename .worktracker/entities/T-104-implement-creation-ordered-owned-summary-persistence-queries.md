---
id: T-104
type: task
title: Implement creation-ordered owned-summary persistence queries
parent: S-044
status: done
dependsOn: [T-103]
tags: [dynamodb, implementation, my-polls, repository]
archived: false
created: 2026-10-03T16:43:21.753Z
updated: 2026-10-04T08:29:48.181Z
---
Implement the chosen owner-scoped query and summary projection with correct filtering/search/order across all relevant database pages. Add or adapt table/index initialization and mutation-time summary/index maintenance only if the approved design requires it; preserve original createdAt, participant count/date accuracy and existing transactional/audit rules. Handle existing records under the documented compatibility strategy and any agreed bounded cursor behavior. Avoid unbounded cross-owner scans or first-page-only filtering/sorting. Pass DynamoDB integration tests; keep local/test table schema and production infrastructure handoff consistent without deploying AWS.