---
id: S-038
type: story
title: Provide safe explicit-poll and smoke-run cleanup utilities
parent: E-011
dependsOn: [S-037]
tags: [cleanup, dynamodb, safety]
archived: false
created: 2026-10-03T10:15:58.125Z
updated: 2026-10-03T10:15:58.125Z
---
Provide a local-only cleanup workflow that supports explicit poll IDs and complete smoke-run clear-down by run ID, deleting all related application, token, participant, index, and audit records with dry-run, confirmation, and endpoint safeguards.