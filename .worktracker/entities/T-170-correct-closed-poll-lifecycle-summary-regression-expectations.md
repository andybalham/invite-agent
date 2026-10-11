---
id: T-170
type: task
title: Correct closed-poll lifecycle summary regression expectations
parent: S-062
status: todo
dependsOn: []
estimate: 1
tags: [integration, my-polls, regression]
archived: false
created: 2026-10-11T11:43:57.583Z
updated: 2026-10-11T11:43:57.583Z
---
Fix T-122 lifecycle-summary integration expectations so closed polls include their persisted finalDate projection while draft/open projections remain unchanged. Acceptance: the affected lifecycle integration tests pass and continue to prove creation ordering, participant counts, lifecycle state, and read-only behavior.