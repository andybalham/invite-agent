---
id: E-011
type: epic
title: "E11 — Ephemeral smoke data and safe local cleanup"
parent: null
dependsOn: [E-010]
tags: [cleanup, documentation, dynamodb, local-development, smoke-test]
archived: false
created: 2026-10-03T10:15:50.127Z
updated: 2026-10-03T10:15:50.127Z
---
Prevent future smoke-test runs from accumulating shared local poll data and provide a narrowly scoped, safe cleanup utility for existing retained smoke data. Future smoke runs should use unique per-run DynamoDB application and audit tables, record the poll IDs created by each run in an explicit run manifest, and remove owned tables during teardown. A separate local-only utility must support explicit poll-ID deletion and complete smoke-run clear-down by run ID, including poll metadata, participants, name indexes, public-token capability records, and audit events. Update developer documentation with safe usage, dry-run/confirmation requirements, retained-data behaviour, and recovery guidance.