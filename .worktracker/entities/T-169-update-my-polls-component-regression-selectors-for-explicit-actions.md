---
id: T-169
type: task
title: Update My polls component regression selectors for explicit actions
parent: S-062
status: done
dependsOn: []
estimate: 1
tags: [component-tests, my-polls, regression]
archived: false
created: 2026-10-11T11:43:55.584Z
updated: 2026-10-11T17:49:41.843Z
---
Update the failing serial My polls component tests to reflect the approved dashboard markup, including the explicit Open poll action rendered alongside each title. Keep assertions scoped to the intended title/action and preserve the canonical poll-page sharing contract. Acceptance: the affected dashboard, loading, and search component tests pass serially without removing or hiding the Open poll action.