---
id: T-172
type: task
title: Run and document the complete non-exhaustive regression suite
parent: S-062
status: done
dependsOn: [T-169, T-170, T-171]
estimate: 1
tags: [e2e, integration, regression, verification]
archived: false
created: 2026-10-11T11:44:01.691Z
updated: 2026-10-11T19:05:24.130Z
---
Run the complete non-exhaustive regression suite after T-169, T-170, and T-171 fixes.

Verification completed 11 October 2026:
- npm run check: exit 0; formatting, lint, typecheck/build, boundaries, security, and 191 foundation tests passed.
- node --test --test-concurrency=1 test/component/*.test.mjs: 154/154 passed.
- node --test --test-concurrency=1 test/integration/*.test.mjs: 76/76 passed.
- Focused T-167 desktop/mobile journey: 2/2 passed.
- Non-exhaustive live E2E set (T-155/T-167/T-123/T-119/T-164/T-166 and navigation/search suites) on isolated API/web ports: 38/38 passed, 2.1 minutes.
- No exhaustive suite run. No commit created.