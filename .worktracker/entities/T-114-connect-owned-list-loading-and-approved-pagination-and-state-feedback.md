---
id: T-114
type: task
title: Connect owned-list loading and approved pagination and state feedback
parent: S-046
status: todo
dependsOn: [T-113]
tags: [api-client, frontend, implementation, my-polls]
archived: false
created: 2026-10-03T16:43:22.707Z
updated: 2026-10-03T16:43:22.707Z
---
Connect the real protected list API to dashboard state with default Active/newest-created behavior and identity-scoped data clearing. Implement approved loading/empty/no-match/error semantics and any chosen pagination UX; if pagination UX is deferred, document that decision and handle backend completeness without silently truncating lists. Preserve safe error feedback and recovery from list requests according to the approved decision. Prevent stale responses or identity changes displaying foreign/incorrect result sets. Add focused client/component tests for response races, identity changes and load failure without prescribing exact copy.