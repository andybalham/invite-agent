---
id: S-006
type: story
title: Manage ordered date and date-time choices safely across DST
parent: E-002
dependsOn: [S-004]
estimate: 3
tags: [dates, dst, e2e, property-test, timezone]
archived: false
created: 2026-09-27T18:06:59.088Z
updated: 2026-09-27T18:06:59.088Z
---
Outcome:
Manage ordered date and date-time choices safely across DST.

Source:
US-02, US-03; approved date/time decision

Acceptance criteria:
- The owner can add, edit, reorder, and remove choices in Draft.
- Date-only choices retain a local ISO date; timed choices retain UTC instant, IANA zone, and selected UTC offset.
- Duplicate/invalid choices and nonexistent local times are rejected; ambiguous local times require explicit offset selection.
- Property, contract, and browser tests cover ordering, duplicates, DST gaps, and DST folds.