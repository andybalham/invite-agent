---
id: T-127
type: task
title: Run dashboard acceptance and regression checks and record implementation evidence
parent: S-049
status: done
dependsOn: [T-125, T-126]
tags: [acceptance, my-polls, regression, verification]
archived: false
created: 2026-10-03T16:43:24.102Z
updated: 2026-10-05T15:00:28.731Z
---
Run established checks appropriate to changed code: formatting/lint/build, complete foundation/contract/domain tests, DynamoDB/API authorization integration, desktop/mobile Playwright acceptance and isolated local smoke. Verify MP-US-01–11 each has evidence, including empty/loading/error decisions, query pagination, title navigation/search/order, lifecycle refresh and public-link isolation. Run relevant existing public collaboration, auth, close/reopen, history/undo and location regressions to catch changed landing assumptions. Confirm all test-owned tables/data are cleaned on success/failure. Record commands/results and actual production-readiness limitations in relevant .docs/README traceability; do not deploy or represent local simulated auth as real Cognito verification.