---
id: S-030
type: story
title: Prove the deployed critical journey with production smoke tests
parent: E-009
dependsOn: [S-029]
estimate: 3
tags: [cognito, e2e, production, smoke-test]
archived: false
created: 2026-09-27T18:07:01.004Z
updated: 2026-09-27T18:07:01.004Z
---
Outcome:
Prove the deployed critical journey with production smoke tests.

Source:
Architecture §§15.2, 16.8

Acceptance criteria:
- Automated smoke checks verify DNS, TLS, security headers, SPA deep links, private-origin delivery, and /api routing.
- A real invited Cognito organiser signs in, creates and publishes a disposable poll, and a fresh unauthenticated context reads and updates it.
- The organiser observes audit history, closes the poll, verifies the public result, and removes or marks disposable data according to the runbook.
- Failures collect correlation IDs and diagnostics without printing credentials or raw link tokens.