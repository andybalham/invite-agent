---
id: S-051
type: story
title: Provision and clean up per-run E2E data safely
parent: E-014
dependsOn: [S-050]
tags: [cleanup, dynamodb, e2e, isolation]
archived: false
created: 2026-10-05T18:50:00.002Z
updated: 2026-10-05T18:54:00.702Z
---
Make every ordinary Playwright run use uniquely owned application and audit tables with reliable teardown.

Acceptance:
- The test runner provisions unique application/audit tables and passes them to the API.
- Browser development continues using the shared local tables.
- Cleanup runs on pass, failure, timeout, and normal interruption where possible.
- Ownership validation prevents deleting unrelated tables.
- Cleanup failures preserve reports and produce actionable recovery diagnostics.
- Repeat runs leave no owned E2E tables or records behind.