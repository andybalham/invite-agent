---
id: T-118
type: task
title: Verify filtering search and creation-date order across browser viewports
parent: S-047
status: done
dependsOn: [T-117]
tags: [e2e, filters, my-polls, ordering, search]
archived: false
created: 2026-10-03T16:43:23.083Z
updated: 2026-10-04T16:27:59.518Z
---
Automate MP-US-04–06 on desktop and mobile with distinct creation times and two owners, including same title across Draft/Open/Closed and another owner's matching title. Assert every filter membership, Active default, Closed exclusion, search within selected filter, retained search on switch, clearing search and no matches. Cover resolved matching semantics and matches beyond the first database/API page when applicable. Edit an older poll and return; assert original createdAt and list position remain creation-based. Snapshot poll/audit state and prove search/filter/navigation perform no writes.