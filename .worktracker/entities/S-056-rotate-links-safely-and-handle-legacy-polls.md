---
id: S-056
type: story
title: Rotate links safely and handle legacy polls
parent: E-015
dependsOn: [S-054]
estimate: 5
tags: [backend, legacy, security]
archived: false
created: 2026-10-10T13:46:01.877Z
updated: 2026-10-10T13:46:12.626Z
---
Add explicit confirmed link rotation with atomic replacement, prior-link revocation, and audit coverage. Define and implement the legacy-poll path when the original token cannot be recovered, without silently breaking existing links.