---
id: S-023
type: story
title: Maintain safe location details in every lifecycle state
parent: E-007
dependsOn: [S-020, S-022]
estimate: 3
tags: [e2e, lifecycle, location, security]
archived: false
created: 2026-09-27T18:07:00.478Z
updated: 2026-09-27T18:07:00.478Z
---
Outcome:
Maintain safe location details in every lifecycle state.

Source:
US-35–US-38

Acceptance criteria:
- The owner can set, edit, or clear location in Draft, Open, and Closed without changing state.
- Preview or public view immediately reflects the saved sanitised value; each success records previous/new values in one audit event.
- Unsafe/excessive input preserves the attempted text for correction but leaves stored/rendered content and history unchanged.
- Link holders and non-owners cannot modify location in any state.