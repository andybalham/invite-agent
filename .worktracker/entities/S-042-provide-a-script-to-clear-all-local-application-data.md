---
id: S-042
type: story
title: Provide a script to clear all local application data
parent: E-011
dependsOn: []
tags: [cleanup, documentation, dynamodb, local-development, safety]
archived: false
created: 2026-10-03T10:51:10.230Z
updated: 2026-10-03T10:51:10.230Z
---
Provide an explicitly invoked local-only script that clears all Invite-a-Gent local DynamoDB tables and persisted local data safely. It must identify the supported local tables and test tables, require clear confirmation or a deliberate force option, refuse non-local endpoints, report what it removed, and document the irreversible effect and recovery expectations.