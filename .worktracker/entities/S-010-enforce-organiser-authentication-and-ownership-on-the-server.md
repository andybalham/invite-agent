---
id: S-010
type: story
title: Enforce organiser authentication and ownership on the server
parent: E-003
dependsOn: [S-008]
estimate: 3
tags: [authorization, contract-test, ownership, security]
archived: false
created: 2026-09-27T18:06:59.422Z
updated: 2026-09-27T18:06:59.422Z
---
Outcome:
Enforce organiser authentication and ownership on the server.

Source:
US-31, US-32; architecture §§5.4, 11

Acceptance criteria:
- Every organiser endpoint derives identity from verified context and ignores any body-supplied owner ID.
- Unauthenticated access returns 401; an authenticated non-owner receives 403; rejected calls change no data or audit history.
- Public capability holders cannot invoke organiser operations.
- Contract tests cover every organiser route and local auth cannot be enabled by the production composition.