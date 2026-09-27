---
id: S-024
type: story
title: Reopen collaboration and close again with preserved history
parent: E-007
dependsOn: [S-022, S-023]
estimate: 3
tags: [audit, e2e, lifecycle, reopening]
archived: false
created: 2026-09-27T18:07:00.556Z
updated: 2026-09-27T18:07:00.556Z
---
Outcome:
Reopen collaboration and close again with preserved history.

Source:
US-28–US-30

Acceptance criteria:
- Reopen requires explicit confirmation; cancellation changes nothing.
- Confirmation sets Open, marks the prior selection provisional, restores participant editing and live ranking, and appends one reopen event.
- The organiser can close again with the same or another date, producing a new atomic close event and frozen ranking.
- History preserves the earlier close, reopen, and later close as distinct revisions.