---
id: T-103
type: task
title: Specify owner-scoped summary queries with DynamoDB integration tests
parent: S-044
status: todo
dependsOn: [T-102]
tags: [dynamodb, integration-test, my-polls, repository]
archived: false
created: 2026-10-03T16:43:21.656Z
updated: 2026-10-03T16:43:21.656Z
---
Write failing DynamoDB Local repository/service tests for each organiser and lifecycle filter, resolved title search, accurate dates/counts, immutable creation ordering and read-only access. Test the complete backing-store page sequence including sparse/nonmatching pages, more than one page, and continuation without omission/duplication for a stable fixture; validate any chosen external cursor semantics. Prove that filtering/searching cannot leak another owner's titles, summaries or continuation data. Test compatibility with pre-dashboard poll records and edited/reopened older polls. Snapshot poll versions/audit counts and assert queries leave them unchanged. Trace MP-US-02–06 and MP-US-10.