---
id: S-008
type: story
title: Publish atomically and issue a secure public capability
parent: E-003
dependsOn: [S-007]
estimate: 3
tags: [audit, publishing, security, token]
archived: false
created: 2026-09-27T18:06:59.251Z
updated: 2026-09-27T18:06:59.251Z
---
Outcome:
Publish atomically and issue a secure public capability.

Source:
US-06; requirements §11; architecture §7

Acceptance criteria:
- Publishing a valid Draft atomically sets Open, stores only a keyed token hash, and appends one audit revision.
- The raw token contains exactly 192 cryptographically random bits encoded as Base64URL and is returned only where needed to form/copy the link.
- Sequential, malformed, reused, or absent tokens do not resolve a poll.
- Unit randomness/format checks, repository transaction tests, and API contract tests pass.