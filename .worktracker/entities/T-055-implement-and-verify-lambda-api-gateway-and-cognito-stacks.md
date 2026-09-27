---
id: T-055
type: task
title: "Implement and verify Lambda, API Gateway, and Cognito stacks"
parent: S-026
status: todo
dependsOn: [T-054]
estimate: 2
tags: [green, implementation, S-026]
archived: false
created: 2026-09-27T18:08:42.955Z
updated: 2026-09-27T18:19:39.316Z
---
Implementation scope:
Implement Node.js 22 ZIP functions, roles, routes, JWT authorizer, PKCE client, throttles, correlation/config wiring, and aliases.

Acceptance criteria:
- Synth proves route protection and least privilege; bundles boot without local auth; callbacks and no-secret client are correct; tests pass.
- Every acceptance criterion in parent story S-026 is satisfied without weakening or deleting the red tests.
- Targeted tests and the relevant regression suite are green.
- Static analysis, security checks, and accessibility checks applicable to the slice pass.
- Changed files, exact verification commands, and results are attached as evidence.