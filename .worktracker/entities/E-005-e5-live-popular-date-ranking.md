---
id: E-005
type: epic
title: "E5 — Live popular-date ranking"
parent: null
dependsOn: [E-004]
estimate: 5
tags: [e2e, property-testing, public-ui, ranking]
archived: false
created: 2026-09-27T18:05:21.564Z
updated: 2026-09-27T18:05:21.564Z
---
Visible deliverable:
The open public poll displays a live, deterministic list of its five most popular dates beside the collaborative response table.

Acceptance criteria:
- Ranking uses Yes total descending and original organiser order as the only tie-breaker.
- No totals never affect rank.
- At most five entries appear; all entries appear when fewer than five dates exist.
- Each entry shows rank, correctly zoned date/time, and Yes total.
- Add, rename, delete, and availability changes refresh totals and ranking from the latest server state.
- Property tests cover ordering invariants and Playwright tests verify the visible list and live updates.