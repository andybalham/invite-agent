---
id: T-143
type: task
title: Implement the owner-scoped share URL endpoint and transport contracts
parent: S-054
status: done
dependsOn: [T-142]
estimate: 2
tags: [api, backend, security]
archived: false
created: 2026-10-10T13:46:08.036Z
updated: 2026-10-10T14:10:01.537Z
---
Authorize by organiser ownership, decrypt only within the service boundary, construct the configured public URL, return safe errors, and keep token material out of logs and list responses.