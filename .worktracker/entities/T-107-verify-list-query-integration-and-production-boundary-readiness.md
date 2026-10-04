---
id: T-107
type: task
title: Verify list-query integration and production boundary readiness
parent: S-044
status: done
dependsOn: [T-106]
tags: [boundaries, integration-test, my-polls, verification]
archived: false
created: 2026-10-03T16:43:22.037Z
updated: 2026-10-04T08:39:44.855Z
---
Run applicable repository/API suites and production-boundary tests. Verify API path/method, query forwarding, authenticated route mapping and least-privilege index/query access in available transport/infrastructure tests; extend assertions where those facilities exist. Keep local auth out of Lambda and ensure public handler cannot serve organiser lists. Record required index/IAM/route changes for pending E-008 where infrastructure is not yet implemented, rather than claiming deployment verification. Confirm pagination/search/summary integration, no reads-as-writes, and fixture teardown on failure.