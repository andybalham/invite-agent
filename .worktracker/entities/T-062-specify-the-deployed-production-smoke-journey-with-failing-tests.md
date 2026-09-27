---
id: T-062
type: task
title: Specify the deployed production smoke journey with failing tests
parent: S-030
status: todo
dependsOn: [T-061]
estimate: 1
tags: [production, red, smoke-test, test-first]
archived: false
created: 2026-09-27T18:09:21.470Z
updated: 2026-09-27T18:19:41.761Z
---
Purpose:
Define the production verification contract before implementing the smoke runner.

Acceptance criteria:
- Smoke specifications cover DNS, TLS, headers, SPA deep links, private-origin delivery, API routing, real Cognito sign-in, persistence, current public link access, audit, and close/result behavior.
- Fixtures use a uniquely marked disposable poll and define safe cleanup or retention-on-failure rules.
- Logging tests prove credentials and raw link tokens are redacted while correlation IDs remain usable.
- A controlled red/dry run and exact commands are recorded before smoke implementation.