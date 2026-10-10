---
id: T-148
type: task
title: "Implement atomic link rotation, capability revocation, and audit event"
parent: S-056
status: todo
dependsOn: [T-147]
estimate: 2
tags: [audit, backend, repository]
archived: false
created: 2026-10-10T13:46:08.488Z
updated: 2026-10-10T13:46:19.539Z
---
Generate replacement tokens, update recoverable and hashed token state atomically, revoke the prior capability, record the organiser action, and preserve conflict handling.