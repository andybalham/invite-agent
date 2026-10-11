---
id: T-165
type: task
title: Implement poll-page share controls and remove dashboard-owned share state
parent: S-060
status: done
dependsOn: [T-164]
estimate: 2
tags: [frontend, security, sharing]
archived: false
created: 2026-10-11T07:56:50.563Z
updated: 2026-10-11T11:24:49.976Z
---
Make the poll-management page the only owner-facing public-link surface.

Acceptance criteria:
- The poll page exposes a prominent Share poll section for authorised organisers.
- Copy, open-as-participant and current-link retrieval use the existing secure endpoints/contracts.
- Rotation remains behind the security disclosure and existing confirmation warning.
- My polls no longer creates per-result share panels, share reset state or dashboard share styling.
- Draft, open, closed, organiser and link-holder visibility rules are enforced in the UI and remain backed by server authorization.
- T-164 passes.