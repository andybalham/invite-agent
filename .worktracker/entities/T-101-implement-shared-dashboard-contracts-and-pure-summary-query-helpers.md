---
id: T-101
type: task
title: Implement shared dashboard contracts and pure summary query helpers
parent: S-043
status: todo
dependsOn: [T-100]
tags: [contracts, domain, implementation, my-polls]
archived: false
created: 2026-10-03T16:43:21.476Z
updated: 2026-10-03T16:43:21.476Z
---
Implement agreed shared request/response validation/types and reusable summary/predicate/order helpers needed by API and frontend. Keep Active a query grouping, preserve immutable creation times and existing date representations, and avoid exposing public tokens or participant response details through summaries. Use existing error codes and architecture boundaries. Make foundation/unit/domain/contract tests pass and preserve existing poll contracts. Do not implement a second lifecycle engine or undocumented matching/date rules.