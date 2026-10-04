---
id: T-121
type: task
title: Integrate saved poll and lifecycle results with dashboard refresh
parent: S-048
status: done
dependsOn: [T-120]
tags: [frontend, implementation, lifecycle, my-polls]
archived: false
created: 2026-10-03T16:43:23.353Z
updated: 2026-10-04T18:22:21.018Z
---
Integrate existing create/save/publish/close/reopen success paths with dashboard load invalidation/refetch on return. Show newly saved drafts in default Active and updated summary dates/counts when opening/returning from management. Keep publication on management with share link; reflect Open -> Closed and Closed -> Open in the required filters. Preserve original createdAt, date order, confirmations, provisional final selection and current public-link behavior. Pass refresh/unit tests and reuse existing services instead of adding dashboard inline close/reopen actions.