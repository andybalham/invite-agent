---
id: T-161
type: task
title: Verify publication sharing closed-poll sharing and link rotation in browser tests
parent: S-060
status: todo
dependsOn: [T-160]
estimate: 2
tags: [browser-tests, security, sharing]
archived: true
created: 2026-10-11T07:55:36.387Z
updated: 2026-10-11T07:56:41.316Z
---
Extend end-to-end coverage for the canonical share workflow.

Acceptance criteria:
- Publication lands on the organiser poll page and exposes the share section.
- Copy and open-as-participant actions work for open and closed polls.
- Rotation requires confirmation, invalidates the old link and keeps dates/responses/history/lifecycle state.
- Link-holder views never show organiser-only share/history/edit/close/reopen controls.
- Owner isolation and token secrecy regression suites pass.