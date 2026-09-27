---
id: S-007
type: story
title: Preview a private draft and enforce publication readiness
parent: E-002
dependsOn: [S-005, S-006]
estimate: 2
tags: [e2e, preview, publication]
archived: false
created: 2026-09-27T18:06:59.172Z
updated: 2026-09-27T18:06:59.172Z
---
Outcome:
Preview a private draft and enforce publication readiness.

Source:
US-04, US-05, US-07

Acceptance criteria:
- Preview displays details, safe location, configured time zone, and ordered choices as participants will see them.
- Preview remains Draft, exposes no working public capability, and accepts no participant response.
- Publish controls identify every blocking field and remain unavailable until validation succeeds.
- Playwright and direct API tests prove invalid drafts remain private and unchanged.