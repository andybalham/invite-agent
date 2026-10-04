---
id: T-111
type: task
title: Verify navigation guards and existing poll-route regressions
parent: S-045
status: done
dependsOn: [T-110]
tags: [e2e, my-polls, verification]
archived: false
created: 2026-10-03T16:43:22.425Z
updated: 2026-10-04T13:17:33.267Z
---
Run new route/unit/browser tests and relevant existing creation/public-route regression cases. Check normal entry and My polls return work with the local simulated identity, authenticated direct management remains owner checked by the server, and public entry works in a fresh context. Ensure failures preserve meaningful traces and no navigation causes mutation or redirect loops. Record MP-US-01/07–09/11 navigation evidence; do not assert production Cognito behavior from local tests.