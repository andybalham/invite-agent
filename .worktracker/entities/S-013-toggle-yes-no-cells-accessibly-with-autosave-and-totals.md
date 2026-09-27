---
id: S-013
type: story
title: Toggle Yes/No cells accessibly with autosave and totals
parent: E-004
dependsOn: [S-011]
estimate: 4
tags: [accessibility, autosave, availability, e2e]
archived: false
created: 2026-09-27T18:06:59.669Z
updated: 2026-09-27T18:06:59.669Z
---
Outcome:
Toggle Yes/No cells accessibly with autosave and totals.

Source:
US-12, US-15

Acceptance criteria:
- Every availability cell is keyboard focusable and communicates participant, date, and current Yes/No state.
- Click and Space each toggle a cell, send one automatic update, and require no Save action.
- The latest server representation replaces displayed state after each accepted mutation.
- Yes totals exclude No and update visibly; each success creates one correctly attributed audit revision.