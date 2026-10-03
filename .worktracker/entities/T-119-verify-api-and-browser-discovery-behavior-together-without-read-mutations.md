---
id: T-119
type: task
title: Verify API and browser discovery behavior together without read mutations
parent: S-047
status: todo
dependsOn: [T-118]
tags: [api-test, e2e, my-polls, verification]
archived: false
created: 2026-10-03T16:43:23.168Z
updated: 2026-10-03T16:43:23.168Z
---
Run applicable pure-rule, API and browser discovery tests together. Check that backend and UI agree on each filter/matching decision and ordered results over all pages; ensure negative cross-owner/no-auth cases remain covered for every query mode. Exercise accessible controls on both layouts and confirm readonly audit/version assertions. Record evidence for MP-US-04–06 and any decision-specific pagination cases without adding unsupported stale-link requirements.