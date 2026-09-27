# Project board

_Generated. Do not edit by hand._

## [E-001 · E1 — Runnable local engineering foundation](./E-001.md) — done
- [x] **S-001 · Establish the TypeScript workspace and shared contracts** — done
  - [x] [T-001 · Specify workspace and shared contracts with failing automated tests](../entities/T-001-specify-workspace-and-shared-contracts-with-failing-automated-tests.md) — done
  - [x] [T-002 · Implement and verify workspace and shared contracts](../entities/T-002-implement-and-verify-workspace-and-shared-contracts.md) — done
- [x] **S-002 · Run shared services locally with DynamoDB and guarded authentication** — done
  - [x] [T-003 · Specify local DynamoDB, shared services, and guarded auth with failing automated tests](../entities/T-003-specify-local-dynamodb-shared-services-and-guarded-auth-with-failing-automated-tests.md) — done
  - [x] [T-004 · Implement and verify local DynamoDB, shared services, and guarded auth](../entities/T-004-implement-and-verify-local-dynamodb-shared-services-and-guarded-auth.md) — done
- [x] **S-003 · Provide one-command local startup and browser test harness** — done
  - [x] [T-005 · Specify one-command local stack and browser harness with failing automated tests](../entities/T-005-specify-one-command-local-stack-and-browser-harness-with-failing-automated-tests.md) — done
  - [x] [T-006 · Implement and verify one-command local stack and browser harness](../entities/T-006-implement-and-verify-one-command-local-stack-and-browser-harness.md) — done

## [E-002 · E2 — Organiser draft builder and preview](./E-002.md) — blocked
- [ ] **S-004 · Define draft poll lifecycle and validation rules** — blocked
  - [ ] [T-007 · Specify draft lifecycle and validation with failing automated tests](../entities/T-007-specify-draft-lifecycle-and-validation-with-failing-automated-tests.md) — todo
  - [ ] [T-008 · Implement and verify draft lifecycle and validation](../entities/T-008-implement-and-verify-draft-lifecycle-and-validation.md) — blocked · waiting on T-007
- [ ] **S-005 · Create and edit draft details with safe location Markdown** — blocked · waiting on S-004
  - [ ] [T-009 · Specify draft details and safe location Markdown with failing automated tests](../entities/T-009-specify-draft-details-and-safe-location-markdown-with-failing-automated-tests.md) — blocked · waiting on T-008
  - [ ] [T-010 · Implement and verify draft details and safe location Markdown](../entities/T-010-implement-and-verify-draft-details-and-safe-location-markdown.md) — blocked · waiting on T-009
- [ ] **S-006 · Manage ordered date and date-time choices safely across DST** — blocked · waiting on S-004
  - [ ] [T-011 · Specify ordered choices and DST-safe date handling with failing automated tests](../entities/T-011-specify-ordered-choices-and-dst-safe-date-handling-with-failing-automated-tests.md) — blocked · waiting on T-008
  - [ ] [T-012 · Implement and verify ordered choices and DST-safe date handling](../entities/T-012-implement-and-verify-ordered-choices-and-dst-safe-date-handling.md) — blocked · waiting on T-011
- [ ] **S-007 · Preview a private draft and enforce publication readiness** — blocked · waiting on S-005, S-006
  - [ ] [T-013 · Specify private preview and publication readiness with failing automated tests](../entities/T-013-specify-private-preview-and-publication-readiness-with-failing-automated-tests.md) — blocked · waiting on T-010, T-012
  - [ ] [T-014 · Implement and verify private preview and publication readiness](../entities/T-014-implement-and-verify-private-preview-and-publication-readiness.md) — blocked · waiting on T-013

## [E-003 · E3 — Publish and securely share a public poll](./E-003.md) — blocked
- [ ] **S-008 · Publish atomically and issue a secure public capability** — blocked · waiting on S-007
  - [ ] [T-015 · Specify atomic publication and public-token issuance with failing automated tests](../entities/T-015-specify-atomic-publication-and-public-token-issuance-with-failing-automated-tests.md) — blocked · waiting on T-014
  - [ ] [T-016 · Implement and verify atomic publication and public-token issuance](../entities/T-016-implement-and-verify-atomic-publication-and-public-token-issuance.md) — blocked · waiting on T-015
- [ ] **S-009 · Render the safe unauthenticated public poll view** — blocked · waiting on S-008
  - [ ] [T-017 · Specify safe public poll view with failing automated tests](../entities/T-017-specify-safe-public-poll-view-with-failing-automated-tests.md) — blocked · waiting on T-016
  - [ ] [T-018 · Implement and verify safe public poll view](../entities/T-018-implement-and-verify-safe-public-poll-view.md) — blocked · waiting on T-017
- [ ] **S-010 · Enforce organiser authentication and ownership on the server** — blocked · waiting on S-008
  - [ ] [T-019 · Specify organiser authentication and ownership with failing automated tests](../entities/T-019-specify-organiser-authentication-and-ownership-with-failing-automated-tests.md) — blocked · waiting on T-016
  - [ ] [T-020 · Implement and verify organiser authentication and ownership](../entities/T-020-implement-and-verify-organiser-authentication-and-ownership.md) — blocked · waiting on T-019

## [E-004 · E4 — Collaborative availability table](./E-004.md) — blocked
- [ ] **S-011 · View responses and add a validated participant row** — blocked · waiting on S-009
  - [ ] [T-021 · Specify participant viewing, creation, and name validation with failing automated tests](../entities/T-021-specify-participant-viewing-creation-and-name-validation-with-failing-automated-tests.md) — blocked · waiting on T-018
  - [ ] [T-022 · Implement participant domain, DynamoDB uniqueness, and public API](../entities/T-022-implement-participant-domain-dynamodb-uniqueness-and-public-api.md) — blocked · waiting on T-021
  - [ ] [T-023 · Build participant table UI and prove end-to-end validation](../entities/T-023-build-participant-table-ui-and-prove-end-to-end-validation.md) — blocked · waiting on T-022
- [ ] **S-012 · Rename and delete any participant row collaboratively** — blocked · waiting on S-011
  - [ ] [T-024 · Specify collaborative participant rename and deletion with failing automated tests](../entities/T-024-specify-collaborative-participant-rename-and-deletion-with-failing-automated-tests.md) — blocked · waiting on T-023
  - [ ] [T-025 · Implement and verify collaborative participant rename and deletion](../entities/T-025-implement-and-verify-collaborative-participant-rename-and-deletion.md) — blocked · waiting on T-024
- [ ] **S-013 · Toggle Yes/No cells accessibly with autosave and totals** — blocked · waiting on S-011
  - [ ] [T-026 · Specify accessible availability toggles and Yes totals with failing automated tests](../entities/T-026-specify-accessible-availability-toggles-and-yes-totals-with-failing-automated-tests.md) — blocked · waiting on T-023
  - [ ] [T-027 · Implement toggle transactions, totals, latest-state response, and audit](../entities/T-027-implement-toggle-transactions-totals-latest-state-response-and-audit.md) — blocked · waiting on T-026
  - [ ] [T-028 · Build accessible autosaving cells and prove mouse/keyboard behavior](../entities/T-028-build-accessible-autosaving-cells-and-prove-mouse-keyboard-behavior.md) — blocked · waiting on T-027
- [ ] **S-014 · Apply concurrent edits with last-update-wins convergence** — blocked · waiting on S-013
  - [ ] [T-029 · Specify last-update-wins service and client convergence with failing automated tests](../entities/T-029-specify-last-update-wins-service-and-client-convergence-with-failing-automated-tests.md) — blocked · waiting on T-028
  - [ ] [T-030 · Implement transparent contention retry and last-commit persistence](../entities/T-030-implement-transparent-contention-retry-and-last-commit-persistence.md) — blocked · waiting on T-029
  - [ ] [T-031 · Implement client freshness handling and prove two-context convergence](../entities/T-031-implement-client-freshness-handling-and-prove-two-context-convergence.md) — blocked · waiting on T-030

## [E-005 · E5 — Live popular-date ranking](./E-005.md) — blocked
- [ ] **S-015 · Calculate deterministic top-five rankings** — blocked · waiting on S-013
  - [ ] [T-032 · Specify deterministic ranking algorithm with failing automated tests](../entities/T-032-specify-deterministic-ranking-algorithm-with-failing-automated-tests.md) — blocked · waiting on T-028
  - [ ] [T-033 · Implement and verify deterministic ranking algorithm](../entities/T-033-implement-and-verify-deterministic-ranking-algorithm.md) — blocked · waiting on T-032
- [ ] **S-016 · Display and refresh the live public ranking** — blocked · waiting on S-014, S-015
  - [ ] [T-034 · Specify live ranking presentation with failing automated tests](../entities/T-034-specify-live-ranking-presentation-with-failing-automated-tests.md) — blocked · waiting on T-031, T-033
  - [ ] [T-035 · Implement and verify live ranking presentation](../entities/T-035-implement-and-verify-live-ranking-presentation.md) — blocked · waiting on T-034

## [E-006 · E6 — Immutable history and safe undo](./E-006.md) — blocked
- [ ] **S-017 · Persist and display complete immutable audit history** — blocked · waiting on S-016
  - [ ] [T-036 · Specify immutable audit persistence and history view with failing automated tests](../entities/T-036-specify-immutable-audit-persistence-and-history-view-with-failing-automated-tests.md) — blocked · waiting on T-035
  - [ ] [T-037 · Implement and verify immutable audit persistence and history view](../entities/T-037-implement-and-verify-immutable-audit-persistence-and-history-view.md) — blocked · waiting on T-036
- [ ] **S-018 · Undo an isolated change with a compensating revision** — blocked · waiting on S-017
  - [ ] [T-038 · Specify ordinary compensating undo with failing automated tests](../entities/T-038-specify-ordinary-compensating-undo-with-failing-automated-tests.md) — blocked · waiting on T-037
  - [ ] [T-039 · Implement and verify ordinary compensating undo](../entities/T-039-implement-and-verify-ordinary-compensating-undo.md) — blocked · waiting on T-038
- [ ] **S-019 · Warn, confirm, or reject complex undo safely** — blocked · waiting on S-018
  - [ ] [T-040 · Specify warned and structurally invalid undo with failing automated tests](../entities/T-040-specify-warned-and-structurally-invalid-undo-with-failing-automated-tests.md) — blocked · waiting on T-039
  - [ ] [T-041 · Implement and verify warned and structurally invalid undo](../entities/T-041-implement-and-verify-warned-and-structurally-invalid-undo.md) — blocked · waiting on T-040
- [ ] **S-020 · Protect audit and undo operations** — blocked · waiting on S-010, S-017
  - [ ] [T-042 · Specify audit and undo authorization with failing automated tests](../entities/T-042-specify-audit-and-undo-authorization-with-failing-automated-tests.md) — blocked · waiting on T-020, T-037
  - [ ] [T-043 · Implement and verify audit and undo authorization](../entities/T-043-implement-and-verify-audit-and-undo-authorization.md) — blocked · waiting on T-042

## [E-007 · E7 — Final decision and reversible poll lifecycle](./E-007.md) — blocked
- [ ] **S-021 · Review attendance and close in one atomic action** — blocked · waiting on S-019
  - [ ] [T-044 · Specify close preview and atomic final selection with failing automated tests](../entities/T-044-specify-close-preview-and-atomic-final-selection-with-failing-automated-tests.md) — blocked · waiting on T-041
  - [ ] [T-045 · Implement and verify close preview and atomic final selection](../entities/T-045-implement-and-verify-close-preview-and-atomic-final-selection.md) — blocked · waiting on T-044
- [ ] **S-022 · Enforce closed read-only state and frozen ranking** — blocked · waiting on S-021
  - [ ] [T-046 · Specify closed-state enforcement and frozen results with failing automated tests](../entities/T-046-specify-closed-state-enforcement-and-frozen-results-with-failing-automated-tests.md) — blocked · waiting on T-045
  - [ ] [T-047 · Implement and verify closed-state enforcement and frozen results](../entities/T-047-implement-and-verify-closed-state-enforcement-and-frozen-results.md) — blocked · waiting on T-046
- [ ] **S-023 · Maintain safe location details in every lifecycle state** — blocked · waiting on S-020, S-022
  - [ ] [T-048 · Specify location maintenance across lifecycle states with failing automated tests](../entities/T-048-specify-location-maintenance-across-lifecycle-states-with-failing-automated-tests.md) — blocked · waiting on T-043, T-047
  - [ ] [T-049 · Implement and verify location maintenance across lifecycle states](../entities/T-049-implement-and-verify-location-maintenance-across-lifecycle-states.md) — blocked · waiting on T-048
- [ ] **S-024 · Reopen collaboration and close again with preserved history** — blocked · waiting on S-022, S-023
  - [ ] [T-050 · Specify reopen and close-again lifecycle with failing automated tests](../entities/T-050-specify-reopen-and-close-again-lifecycle-with-failing-automated-tests.md) — blocked · waiting on T-047, T-049
  - [ ] [T-051 · Implement and verify reopen and close-again lifecycle](../entities/T-051-implement-and-verify-reopen-and-close-again-lifecycle.md) — blocked · waiting on T-050

## [E-008 · E8 — Production AWS platform](./E-008.md) — blocked
- [ ] **S-025 · Provision durable DynamoDB application and audit data** — blocked · waiting on S-024
  - [ ] [T-052 · Specify production DynamoDB stacks with failing automated tests](../entities/T-052-specify-production-dynamodb-stacks-with-failing-automated-tests.md) — blocked · waiting on T-051
  - [ ] [T-053 · Implement and verify production DynamoDB stacks](../entities/T-053-implement-and-verify-production-dynamodb-stacks.md) — blocked · waiting on T-052
- [ ] **S-026 · Deploy least-privilege Lambda APIs with Cognito authorization** — blocked · waiting on S-025
  - [ ] [T-054 · Specify Lambda, API Gateway, and Cognito stacks with failing automated tests](../entities/T-054-specify-lambda-api-gateway-and-cognito-stacks-with-failing-automated-tests.md) — blocked · waiting on T-053
  - [ ] [T-055 · Implement and verify Lambda, API Gateway, and Cognito stacks](../entities/T-055-implement-and-verify-lambda-api-gateway-and-cognito-stacks.md) — blocked · waiting on T-054
- [ ] **S-027 · Serve the SPA through private S3, CloudFront, DNS, and TLS** — blocked · waiting on S-026
  - [ ] [T-056 · Specify private web edge, DNS, and TLS with failing automated tests](../entities/T-056-specify-private-web-edge-dns-and-tls-with-failing-automated-tests.md) — blocked · waiting on T-055
  - [ ] [T-057 · Implement and verify private web edge, DNS, and TLS](../entities/T-057-implement-and-verify-private-web-edge-dns-and-tls.md) — blocked · waiting on T-056
- [ ] **S-028 · Add production observability, limits, and security safeguards** — blocked · waiting on S-026
  - [ ] [T-058 · Specify production observability and safeguards with failing automated tests](../entities/T-058-specify-production-observability-and-safeguards-with-failing-automated-tests.md) — blocked · waiting on T-055
  - [ ] [T-059 · Implement and verify production observability and safeguards](../entities/T-059-implement-and-verify-production-observability-and-safeguards.md) — blocked · waiting on T-058

## [E-009 · E9 — Tested production release and operations](./E-009.md) — blocked
- [ ] **S-029 · Automate test-gated packaging and deployment** — blocked · waiting on S-027, S-028
  - [ ] [T-060 · Specify test-gated release automation with failing tests](../entities/T-060-specify-test-gated-release-automation-with-failing-tests.md) — blocked · waiting on T-057, T-059
  - [ ] [T-061 · Implement and verify test-gated release automation](../entities/T-061-implement-and-verify-test-gated-release-automation.md) — blocked · waiting on T-060
- [ ] **S-030 · Prove the deployed critical journey with production smoke tests** — blocked · waiting on S-029
  - [ ] [T-062 · Specify the deployed production smoke journey with failing tests](../entities/T-062-specify-the-deployed-production-smoke-journey-with-failing-tests.md) — blocked · waiting on T-061
  - [ ] [T-063 · Implement and execute the production smoke journey](../entities/T-063-implement-and-execute-the-production-smoke-journey.md) — blocked · waiting on T-062
- [ ] **S-031 · Complete operational handoff and MVP traceability** — blocked · waiting on S-030
  - [ ] [T-064 · Specify operational handoff and traceability checks](../entities/T-064-specify-operational-handoff-and-traceability-checks.md) — blocked · waiting on T-063
  - [ ] [T-065 · Complete and verify operational handoff and MVP traceability](../entities/T-065-complete-and-verify-operational-handoff-and-mvp-traceability.md) — blocked · waiting on T-064
