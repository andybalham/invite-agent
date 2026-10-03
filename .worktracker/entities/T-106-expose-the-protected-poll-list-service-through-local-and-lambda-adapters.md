---
id: T-106
type: task
title: Expose the protected poll-list service through local and Lambda adapters
parent: S-044
status: todo
dependsOn: [T-104, T-105]
tags: [api, implementation, my-polls, security]
archived: false
created: 2026-10-03T16:43:21.943Z
updated: 2026-10-03T16:43:21.943Z
---
Implement the authenticated organiser list service and route in shared services with thin existing local/Lambda adapters. Obtain owner identity from the guarded local identity or verified production claims, never caller owner fields/public tokens. Validate query/cursor inputs, call owned-summary repository functions, and return agreed summaries/error codes without token/response leakage. Ensure list data cannot be reused across organiser identities through client/server caching. Pass direct HTTP/API and adapter authorization tests while retaining existing per-poll ownership checks.