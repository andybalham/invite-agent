---
id: S-020
type: story
title: Protect audit and undo operations
parent: E-006
dependsOn: [S-010, S-017]
estimate: 2
tags: [audit, authorization, contract-test]
archived: false
created: 2026-09-27T18:07:00.238Z
updated: 2026-09-27T18:07:00.238Z
---
Outcome:
Protect audit and undo operations.

Source:
US-23, US-31, US-32

Acceptance criteria:
- Public link holders cannot read history, preview undo, or execute undo.
- Authenticated non-owners cannot access another owner's history or undo controls.
- Rejected requests reveal no event content and change neither current state nor history.
- Direct API tests assert 401/403 semantics across all audit routes.