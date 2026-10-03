---
id: T-096
type: task
title: Implement the guarded all-local-data cleanup script
parent: S-042
status: todo
dependsOn: [T-095]
tags: [cleanup, dynamodb, local-development, safety]
archived: false
created: 2026-10-03T10:51:46.986Z
updated: 2026-10-03T10:51:46.986Z
---
Create an explicitly invoked local-only script that discovers supported local and test tables, previews targets, requires deliberate confirmation or force mode, deletes only approved local resources, and reports successes, skips, and failures without touching non-local endpoints.