---
id: T-094
type: task
title: Verify integration-suite cleanup and failure reporting
parent: S-041
status: done
dependsOn: [T-093]
tags: [cleanup, integration-tests, verification]
archived: false
created: 2026-10-03T10:51:46.829Z
updated: 2026-10-03T15:41:48.397Z
---
Verified S-041 on 2026-10-03 with Node v24.19.0 and a temporary in-memory DynamoDB Local 2.6.1 instance at http://127.0.0.1:18001. Build passed. Focused command: node --test --test-timeout=60000 test/foundation/integration-fixture.test.mjs test/foundation/smoke-resources.test.mjs test/integration/integration-cleanup.test.mjs test/integration/local-services.test.mjs test/integration/local-node-http.test.mjs: 20 passed, 0 failed, 0 skipped (1332.1295 ms). Initial focused attempt was 19/20 because NODE_TEST_CONTEXT prevented the child runner from executing; corrected the child environment and reran successfully.

Full integration command: node --test --test-timeout=60000 test/integration/*.test.mjs: 49 passed, 0 failed, 0 skipped, 0 cancelled (4620.6768 ms), with DYNAMODB_ENDPOINT=http://127.0.0.1:18001. Four intentionally failing child scenarios return exit 1 as expected: partial setup, assertion, assertion plus cleanup error, and cleanup-only error. Verified original error reporting, diagnostics, no child-owned tables, repeated cleanup, missing tables, creation collisions, attempted cleanup of both tables and preservation of local/smoke sentinel data. Paginated ListTables after the suite: zero total tables / zero invite-agent-test-* tables. Existing port 18000 database preserved: 842 total tables including 768 historical invite-agent-test-* tables and the two shared local tables. No historical tables were swept.

node scripts/lint.mjs, node scripts/check-format.mjs and git diff --check passed. Full foundation suite, browser E2E/smoke suite and npm run check were not run; user requested wrap-up after this check phase. No README change required: teardown is fixture-internal.