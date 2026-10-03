---
id: S-039
type: story
title: "Verify cleanup isolation, repeatability, and failure recovery"
parent: E-011
dependsOn: [S-038]
tags: [smoke-test, testing, verification]
archived: false
created: 2026-10-03T10:15:58.204Z
updated: 2026-10-03T10:15:58.204Z
---
Prove that repeated and failed smoke runs do not leak retained data, that run-ID cleanup removes every owned poll, that explicit deletion is complete and paginated, and that unrelated local data remains untouched.