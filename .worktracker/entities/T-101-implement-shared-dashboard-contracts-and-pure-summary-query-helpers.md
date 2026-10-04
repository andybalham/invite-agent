---
id: T-101
type: task
title: Implement shared dashboard contracts and pure summary query helpers
parent: S-043
status: done
dependsOn: [T-100]
tags: [contracts, domain, implementation, my-polls]
archived: false
created: 2026-10-03T16:43:21.476Z
updated: 2026-10-04T07:06:33.655Z
---
Implement agreed shared request/response validation/types and reusable summary/predicate/order helpers needed by API and frontend. Keep Active a query grouping, preserve immutable creation times and existing date representations, and avoid exposing public tokens or participant response details through summaries. Use existing error codes and architecture boundaries. Make foundation/unit/domain/contract tests pass and preserve existing poll contracts. Do not implement a second lifecycle engine or undocumented matching/date rules.

Verification: implemented strict shared owned-list request/summary/page/HTTP-error schemas, normalized query defaults/title matching, and owner/filter/order/summary pure helpers. All 11 new dashboard tests pass. npm run check passed: format, lint, TypeScript build/typecheck, production boundaries, 105 foundation tests and security scan. git diff --check passed. README unchanged because no operational commands or delivered endpoint/UI changed. No S-044 or later task started; endpoint/cursor signing/count backfill remain documented handoffs.