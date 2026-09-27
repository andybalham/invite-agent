---
id: T-006
type: task
title: Implement and verify one-command local stack and browser harness
parent: S-003
status: done
dependsOn: [T-005]
estimate: 2
tags: [green, implementation, S-003]
archived: false
created: 2026-09-27T18:08:39.608Z
updated: 2026-09-27T19:23:42.460Z
---
Implementation scope:
Implement readiness-based start/stop scripts, Vite shell, health surface, isolated fixtures, CI cleanup, and failure artifact capture.

Acceptance criteria:
- One command starts a healthy browser app; stop is scoped; headless CI passes and retains diagnostics on intentional failure.
- Every acceptance criterion in parent story S-003 is satisfied without weakening or deleting the red tests.
- Targeted tests and the relevant regression suite are green.
- Static analysis, security checks, and accessibility checks applicable to the slice pass.
- Changed files, exact verification commands, and results are attached as evidence.

Evidence:
- Changed: package.json, package-lock.json, .gitignore, compose.yaml, backend/src/adapters/local/dev-server.ts, frontend/index.html, frontend/src/main.ts, frontend/src/styles.css, frontend/vite.config.ts, playwright.config.ts, test/foundation/dev-harness.test.mjs, test/e2e/fixtures.ts, test/e2e/shell.spec.ts, test/e2e/diagnostics.spec.ts, test/integration/local-node-http.test.mjs, test/integration/local-services.test.mjs, scripts/Start-DevStack.ps1, scripts/Stop-DevStack.ps1, scripts/Run-FoundationTests.ps1, .github/workflows/foundation.yml.
- npm run check: passed formatting, lint, TypeScript, 15 foundation tests, production-boundary checks, and security checks.
- npm run test:foundation: passed 15 contract tests plus 1 Chromium smoke test; 1 opt-in diagnostic probe skipped; the configured stack became ready and recorded processes were stopped.
- HARNESS_DIAGNOSTIC_PROBE=1 Playwright diagnostic run: intentionally failed on API healthy vs deliberate mismatch and retained screenshot, trace, video, api.log, API stdout/stderr, and Vite stdout/stderr.
- npm run test:integration: 4 tests passed, covering Node HTTP translation, isolated DynamoDB tables, shared validation/auth/persistence/audit/error mapping, and local-auth guards.
- npm run dev:stop after probe: passed and stopped recorded project processes only.
- npm install audit result: 0 vulnerabilities.

Configurable-port follow-up:
- Added environment and PowerShell parameter support for DYNAMODB_PORT, API_PORT, and WEB_PORT.
- Defaults are DynamoDB 18000, API 14000, and web 15173; resolved ports are recorded in .devstack/processes.json.
- Compose, API composition, Vite proxy/listener, Playwright base URL, and integration fixtures all consume the same settings.
- npm run check: passed.
- npm run test:foundation with defaults: passed; ready at web 15173, API 14000, DynamoDB 18000, then cleaned up.
- DYNAMODB_PORT=18080 API_PORT=14080 WEB_PORT=15180 npm run test:foundation: passed on all overrides and cleaned up.