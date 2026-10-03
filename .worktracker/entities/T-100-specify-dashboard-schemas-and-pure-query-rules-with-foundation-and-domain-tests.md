---
id: T-100
type: task
title: Specify dashboard schemas and pure query rules with foundation and domain tests
parent: S-043
status: todo
dependsOn: [T-099]
tags: [contract-test, domain-test, foundation-test, my-polls, unit-test]
archived: false
created: 2026-10-03T16:43:21.369Z
updated: 2026-10-03T16:43:21.369Z
---
Add failing tests in the established foundation/unit/domain/contract harness for the agreed owned-list request/response shape, malformed query/page/cursor inputs where applicable, required summary fields, Active membership (Draft + Open), every state filter, resolved title matching and newest-created ordering using distinct timestamps. Cover date-only/timed summary preservation, zero proposed dates on valid incomplete drafts and zero participants, and invariant that edits/publish/close/reopen do not replace createdAt. Assert invalid lifecycle values and stable existing error semantics; test equal-time ordering only if an implementation decision is recorded. Trace MP-US-02–06 and MP-US-10.