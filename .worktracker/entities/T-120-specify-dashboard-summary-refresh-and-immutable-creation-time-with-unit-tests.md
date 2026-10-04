---
id: T-120
type: task
title: Specify dashboard summary refresh and immutable creation time with unit tests
parent: S-048
status: done
dependsOn: [T-115]
tags: [domain-test, lifecycle, my-polls, unit-test]
archived: false
created: 2026-10-03T16:43:23.263Z
updated: 2026-10-04T18:12:06.775Z
---
Write failing client/domain tests for returning after draft create/edit, publish, close and reopen; refreshing summaries/current counts; keeping publication on management; and reconciling filter membership on return. Prove older edited/reopened polls retain createdAt and creation-order position. Reuse existing lifecycle command/confirmation behavior and distinguish mutation-triggered refresh from read-only dashboard access. Define refresh/invalidation behavior within the approved navigation/data design rather than adding real-time requirements.