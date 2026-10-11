---
id: T-166
type: task
title: Verify publication sharing closed-poll sharing and link rotation in browser tests
parent: S-060
status: todo
dependsOn: [T-165]
estimate: 2
tags: [browser-tests, security, sharing]
archived: false
created: 2026-10-11T07:56:50.639Z
updated: 2026-10-11T07:56:50.639Z
---
Extend end-to-end coverage for the canonical share workflow.

Acceptance criteria:
- Publication lands on the organiser poll page and exposes the share section.
- Copy and open-as-participant actions work for open and closed polls.
- Rotation requires confirmation, invalidates the old link and keeps dates/responses/history/lifecycle state.
- Link-holder views never show organiser-only share/history/edit/close/reopen controls.
- Owner isolation and token secrecy regression suites pass.