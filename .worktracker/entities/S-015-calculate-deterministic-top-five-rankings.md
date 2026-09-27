---
id: S-015
type: story
title: Calculate deterministic top-five rankings
parent: E-005
dependsOn: [S-013]
estimate: 2
tags: [domain, property-test, ranking]
archived: false
created: 2026-09-27T18:06:59.833Z
updated: 2026-09-27T18:06:59.833Z
---
Outcome:
Calculate deterministic top-five rankings.

Source:
US-17, US-18

Acceptance criteria:
- Ranking sorts by Yes total descending and original proposed-date order for all ties.
- No totals and participant ordering never affect the result.
- The result contains at most five entries and includes all choices when fewer than five exist.
- Property tests cover arbitrary response matrices, stable ties, limits, and deterministic output.