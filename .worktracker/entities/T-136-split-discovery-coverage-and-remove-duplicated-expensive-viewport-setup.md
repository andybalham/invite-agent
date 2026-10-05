---
id: T-136
type: task
title: Split discovery coverage and remove duplicated expensive viewport setup
parent: S-052
status: todo
dependsOn: [T-134]
estimate: 4
tags: [e2e, performance, playwright]
archived: false
created: 2026-10-05T18:50:36.209Z
updated: 2026-10-05T18:50:36.209Z
---
Separate fast dashboard regression from exhaustive T-119 and sparse-pagination cases, and avoid reseeding equivalent large datasets independently for desktop and mobile where coverage permits.