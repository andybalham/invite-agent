---
id: T-128
type: task
title: Specify the E2E isolation boundary and prohibit shared-table writes
parent: S-050
status: done
dependsOn: []
estimate: 2
tags: [dynamodb, e2e, isolation]
archived: false
created: 2026-10-05T18:50:35.599Z
updated: 2026-10-06T17:38:24.295Z
---
Document the normal browser-development tables as forbidden targets for ordinary E2E runs; define explicit opt-in behaviour, environment propagation, and checks that fail before tests can write to shared tables.