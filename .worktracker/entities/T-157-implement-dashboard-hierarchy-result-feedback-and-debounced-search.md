---
id: T-157
type: task
title: Implement dashboard hierarchy result feedback and debounced search
parent: S-059
status: todo
dependsOn: [T-156]
estimate: 2
tags: [frontend, pagination, responsive, search]
archived: false
created: 2026-10-11T07:55:36.087Z
updated: 2026-10-11T07:55:36.087Z
---
Implement the dashboard changes required by T-156.

Acceptance criteria:
- Desktop table and mobile cards use compact date summaries and clear result hierarchy.
- Dashboard actions are limited to navigation/date access and do not own public-link panels.
- Loaded-result feedback is accurate for the number of rendered unique items.
- Search is debounced or Enter-submitted and cancels/ignores stale responses as before.
- Existing filters, pagination, retry, no-match and empty states remain functional.
- T-156 passes without weakening existing API contracts.