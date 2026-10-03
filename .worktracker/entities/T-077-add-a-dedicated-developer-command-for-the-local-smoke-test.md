---
id: T-077
type: task
title: Add a dedicated developer command for the local smoke test
parent: S-036
status: todo
dependsOn: [T-076]
tags: [developer-experience, testing]
archived: false
created: 2026-10-03T09:03:30.547Z
updated: 2026-10-03T09:03:30.547Z
---
Expose the smoke journey through a documented npm command and define whether it expects or manages the local stack. Ensure WEB_PORT and related configuration are passed consistently and that cleanup occurs on success or failure.