---
id: E-006
type: epic
title: "E6 — Immutable history and safe undo"
parent: null
dependsOn: [E-005]
estimate: 11
tags: [audit, e2e, security, undo]
archived: false
created: 2026-09-27T18:05:21.651Z
updated: 2026-09-27T18:05:21.651Z
---
Visible deliverable:
The owning organiser can inspect a newest-first immutable history and safely undo supported changes, including a warned overwrite of newer work, while public users cannot access history controls.

Acceptance criteria:
- Every successful mutation is represented by one immutable event with affected entity, action, before/after values, timestamp, actor category, and organiser identity when applicable.
- Credentials, session data, raw public tokens, and sensitive request data never enter audit storage or views.
- Ordinary undo restores prior state, recalculates derived totals/ranking, preserves the original event, and appends one undo event.
- Undoing over a newer value requires a preview and explicit confirmation; confirmation restores the selected event's prior value.
- Structurally invalid undo is rejected atomically with no partial state or audit event.
- Audit read and undo routes enforce authentication and ownership.
- Domain, repository, contract, and Playwright tests pass.