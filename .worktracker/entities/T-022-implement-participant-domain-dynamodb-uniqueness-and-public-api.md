---
id: T-022
type: task
title: "Implement participant domain, DynamoDB uniqueness, and public API"
parent: S-011
status: done
dependsOn: [T-021]
estimate: 1.5
tags: [backend, green, implementation, S-011]
archived: false
created: 2026-09-27T18:08:40.744Z
updated: 2026-09-28T19:50:13.480Z
---
Implementation scope:
Implement participant domain, DynamoDB uniqueness, and public API.

Acceptance criteria:
- Implement participant/name-lock transactions, 100-code-point validation, NFKC case-fold keying, Yes/No validation, default-No responses, and public add/view APIs.
- The service/repository/API portion of every parent criterion is implemented without weakening or deleting the red tests.
- Targeted unit, repository, and contract tests are green; failures retain actionable diagnostics.
- Files, commands, and test results are attached as evidence.

Evidence:
- Added participant-name domain validation, participant/name-lock DynamoDB transactions, public participant creation/read routes, atomic anonymous audit revisions, and public projections.
- Commands: npm run build; node --test test/foundation/participant-name.test.mjs; local dev stack + node --test test/integration/collaborative-availability.test.mjs.
- Results: build green; 4/4 domain tests green; 2/2 DynamoDB integration tests green.