---
id: T-131
type: task
title: Implement per-run E2E table provisioning and API configuration
parent: S-051
status: todo
dependsOn: [T-129]
estimate: 4
tags: [dynamodb, e2e, isolation]
archived: false
created: 2026-10-05T18:50:35.822Z
updated: 2026-10-05T18:50:35.822Z
---
Provision unique application and audit tables for ordinary Playwright runs, pass exact names to the local API and helpers, and fail safely if the configured endpoint or names are unsafe.