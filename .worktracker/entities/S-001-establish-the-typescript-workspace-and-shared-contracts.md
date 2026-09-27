---
id: S-001
type: story
title: Establish the TypeScript workspace and shared contracts
parent: E-001
dependsOn: []
estimate: 2
tags: [contracts, foundation, testing]
archived: false
created: 2026-09-27T18:06:58.673Z
updated: 2026-09-27T18:06:58.673Z
---
Outcome:
Establish the TypeScript workspace and shared contracts.

Source:
Architecture §§14, 16.2, 16.8

Acceptance criteria:
- Workspace exposes frontend, backend, infra, contracts, scripts, and test packages with locked dependencies.
- Shared schemas define lifecycle states, Yes/No availability, request/response DTOs, and stable error codes; backend validation remains authoritative.
- Formatting, linting, type-checking, and a representative unit test run from root commands.
- Architecture-boundary tests prevent local-only adapters entering production bundles.