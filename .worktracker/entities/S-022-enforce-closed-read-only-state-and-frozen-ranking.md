---
id: S-022
type: story
title: Enforce closed read-only state and frozen ranking
parent: E-007
dependsOn: [S-021]
estimate: 3
tags: [authorization, closed-state, e2e, ranking]
archived: false
created: 2026-09-27T18:07:00.408Z
updated: 2026-09-27T18:07:00.408Z
---
Outcome:
Enforce closed read-only state and frozen ranking.

Source:
US-26, US-27

Acceptance criteria:
- The public page prominently displays the selected date and closing-time ranking, with the result primary even if not ranked first.
- Participant and proposed-date editing controls are unavailable while Closed.
- Direct public participant and organiser date mutations are rejected with 422 and no change to data, totals, ranking, or audit history.
- Reloads and fresh contexts see the same frozen result.