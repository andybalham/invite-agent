---
id: S-003
type: story
title: Provide one-command local startup and browser test harness
parent: E-001
dependsOn: [S-002]
estimate: 3
tags: [ci, developer-experience, frontend, playwright]
archived: false
created: 2026-09-27T18:06:58.854Z
updated: 2026-09-27T18:06:58.854Z
---
Outcome:
Provide one-command local startup and browser test harness.

Source:
Architecture §§16.6–16.8

Acceptance criteria:
- Start-DevStack.ps1 waits for DynamoDB, API, and Vite readiness; Stop-DevStack.ps1 stops only recorded project processes.
- The browser-visible shell loads at localhost and reports a healthy API.
- Playwright uses isolated fixtures and collects traces, screenshots, API logs, and service logs on failure.
- CI executes the foundation suite headlessly and always cleans up.