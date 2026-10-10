---
id: T-142
type: task
title: Implement atomic recoverable-token persistence during publication
parent: S-054
status: done
dependsOn: [T-141]
estimate: 2
tags: [backend, repository, security]
archived: false
created: 2026-10-10T13:46:07.947Z
updated: 2026-10-10T14:06:59.414Z
---
Persist the hash and encrypted token as one publication change while preserving capability validation, conditional draft-to-open transitions, and local/Dynamo adapter parity.