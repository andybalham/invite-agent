---
id: T-063
type: task
title: Implement and execute the production smoke journey
parent: S-030
status: todo
dependsOn: [T-062]
estimate: 2
tags: [green, implementation, production, smoke-test]
archived: false
created: 2026-09-27T18:09:21.531Z
updated: 2026-09-27T18:19:39.565Z
---
Implementation scope:
Implement safe disposable setup/cleanup and execute the critical organiser and public browser journey through the production vanity domain.

Acceptance criteria:
- Edge, real Cognito, API/Lambda, DynamoDB persistence, public collaboration, audit visibility, closure, and public result checks pass.
- The run is repeatable and never prints credentials, raw tokens, or sensitive bodies.
- Failures retain correlation-linked diagnostics and preserve disposable data only when the runbook requires investigation.
- Production commands, timestamps, build identity, and results are attached as evidence.