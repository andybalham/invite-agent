---
id: S-044
type: story
title: Query organiser-owned poll summaries through a secure list API
parent: E-012
dependsOn: [S-043]
tags: [api, dynamodb, integration-test, my-polls, security]
archived: false
created: 2026-10-03T16:38:57.248Z
updated: 2026-10-03T16:38:57.248Z
---
Deliver the authenticated owned-poll list for MP-US-02–06 and MP-US-10–11 using shared services and thin local/Lambda adapters. Derive ownership from verified request identity; do not trust caller owner IDs or public tokens. Return title, status, immutable createdAt, proposed dates and participant count; apply selected lifecycle/title predicates and newest-created ordering across the complete owned result set. Use the agreed bounded query/pagination design and test all backing-store pages, authorization, existing data compatibility and absence of writes/audit events. Support current local application; prepare production wiring consistently without deploying AWS resources.