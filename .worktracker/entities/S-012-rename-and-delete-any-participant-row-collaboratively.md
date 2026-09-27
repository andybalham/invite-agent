---
id: S-012
type: story
title: Rename and delete any participant row collaboratively
parent: E-004
dependsOn: [S-011]
estimate: 3
tags: [collaboration, e2e, participants]
archived: false
created: 2026-09-27T18:06:59.590Z
updated: 2026-09-27T18:06:59.590Z
---
Outcome:
Rename and delete any participant row collaboratively.

Source:
US-13, US-14

Acceptance criteria:
- Any active link holder can rename any row to a valid unique name without changing responses.
- A duplicate rename is rejected under the same normalized uniqueness rule and creates no audit event.
- Deletion requires the entered confirmation to equal the current display name exactly; mismatch leaves all state unchanged.
- Successful rename/delete autosaves, refreshes the latest table, recalculates totals, and creates exactly one audit revision.