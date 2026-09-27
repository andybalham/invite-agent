---
id: E-001
type: epic
title: "E1 — Runnable local engineering foundation"
parent: null
dependsOn: []
estimate: 8
tags: [foundation, local-dev, testing, vertical-slice]
archived: false
created: 2026-09-27T18:04:39.026Z
updated: 2026-09-27T18:04:39.026Z
---
Visible deliverable:
A contributor can start Invite-a-Gent locally with one command, open the React application, exercise a health endpoint backed by the shared application composition, and run the initial automated test suite without AWS credentials.

Acceptance criteria:
- The TypeScript workspace contains frontend, backend, shared contracts, infrastructure, and test boundaries matching the architecture.
- DynamoDB Local, the local HTTP adapter, guarded local authentication, and deterministic table initialization run through documented start/stop commands.
- A browser-visible application shell and API health check run at the documented local URLs.
- Formatting, linting, unit, integration, contract, and Playwright harnesses execute through repeatable commands.
- CI runs the foundation checks and retains useful diagnostics on failure.
- No production code path can enable the local authentication bypass.