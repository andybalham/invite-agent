---
id: T-117
type: task
title: Implement lifecycle filters and title-search controls against the owned-list API
parent: S-047
status: todo
dependsOn: [T-116]
tags: [frontend, implementation, my-polls, search]
archived: false
created: 2026-10-03T16:43:22.994Z
updated: 2026-10-03T16:43:22.994Z
---
Implement labelled accessible Active/Draft/Open/Closed controls and title search above both desktop/mobile lists. Keep Active selected initially; preserve search while switching filters, clear to the current filter, and expose usable no-match feedback. Send agreed filter/search/page parameters to the server; retain server creation-date ordering and discard stale responses when query state changes. Reset pagination as approved so results from different filters/searches cannot mix. Pass unit/component query-state tests and preserve identity isolation.