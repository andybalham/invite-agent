---
id: T-094
type: task
title: Verify integration-suite cleanup and failure reporting
parent: S-041
status: todo
dependsOn: [T-093]
tags: [cleanup, integration-tests, verification]
archived: false
created: 2026-10-03T10:51:46.829Z
updated: 2026-10-03T10:51:46.829Z
---
Run the integration suite and forced-failure cases, verify no invite-agent-test-* tables remain afterward, confirm cleanup is idempotent, and ensure cleanup errors are reported without masking the original assertion failure.