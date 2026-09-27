---
id: S-009
type: story
title: Render the safe unauthenticated public poll view
parent: E-003
dependsOn: [S-008]
estimate: 3
tags: [accessibility, e2e, public-ui]
archived: false
created: 2026-09-27T18:06:59.336Z
updated: 2026-09-27T18:06:59.336Z
---
Outcome:
Render the safe unauthenticated public poll view.

Source:
US-06, US-07, US-08, US-35

Acceptance criteria:
- A fresh unauthenticated context can open the active link without account or password.
- The page shows poll details, sanitised location, ordered choices, lifecycle state, and the collaborative-sharing notice.
- Drafts, organiser identity, audit data, raw stored hashes, and management controls are never disclosed.
- Unknown links receive 404 and recognised revoked links receive 410 with non-sensitive accessible messaging.