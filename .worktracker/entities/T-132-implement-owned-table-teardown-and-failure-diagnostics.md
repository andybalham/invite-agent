---
id: T-132
type: task
title: Implement owned-table teardown and failure diagnostics
parent: S-051
status: todo
dependsOn: [T-131]
estimate: 4
tags: [cleanup, diagnostics, e2e]
archived: false
created: 2026-10-05T18:50:35.896Z
updated: 2026-10-05T18:50:35.896Z
---
Delete only the current run's owned tables in finally paths, record cleanup status and errors, preserve browser/service diagnostics, and support retryable recovery after partial cleanup.