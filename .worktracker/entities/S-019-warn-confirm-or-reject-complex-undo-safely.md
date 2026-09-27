---
id: S-019
type: story
title: "Warn, confirm, or reject complex undo safely"
parent: E-006
dependsOn: [S-018]
estimate: 3
tags: [e2e, safety, undo]
archived: false
created: 2026-09-27T18:07:00.160Z
updated: 2026-09-27T18:07:00.160Z
---
Outcome:
Warn, confirm, or reject complex undo safely.

Source:
US-22; approved undo decision

Acceptance criteria:
- A selected event whose value changed later returns a preview identifying the overwrite risk.
- Cancellation changes nothing; explicit confirmation restores the selected event's documented prior value and appends one undo event.
- An undo that would violate current structural invariants is rejected atomically with an actionable error and no audit event.
- Tests cover newer overlapping values, unrelated later work, invalid structure, and derived ranking recalculation.