---
id: T-122
type: task
title: Verify lifecycle summaries and read-only list behavior with server integration tests
parent: S-048
status: todo
dependsOn: [T-121]
tags: [api-test, domain-test, integration-test, my-polls]
archived: false
created: 2026-10-03T16:43:23.451Z
updated: 2026-10-03T16:43:23.451Z
---
Drive existing create/edit/publish/participant/close/reopen APIs against DynamoDB Local and then query owned summaries. Assert current status/proposed dates/participant counts, unchanged createdAt and creation ordering, and exact existing audit increments for mutations (atomic close once and separate reopen); repeated list/search/filter calls add none. Cover rejected non-owner/public lifecycle operations and retained closed-state write restrictions. If summaries use stored projections, prove mutation/undo paths keep those fields accurate without extra dashboard audit revisions. Trace MP-US-07–10 and existing authorization/lifecycle acceptance.