---
id: S-017
type: story
title: Persist and display complete immutable audit history
parent: E-006
dependsOn: [S-016]
estimate: 3
tags: [audit, e2e, history, integration]
archived: false
created: 2026-09-27T18:07:00.002Z
updated: 2026-09-27T18:07:00.002Z
---
Outcome:
Persist and display complete immutable audit history.

Source:
US-20; requirements §8

Acceptance criteria:
- Each successful poll, date, participant, location, link, and lifecycle mutation appends exactly one immutable event unless an explicitly atomic compound action specifies one.
- Events record entity, action, before/after domain values, server time, actor category, and organiser subject where applicable.
- History is paged newest first for the owner and renders meaningful changes.
- Tests prove tokens, credentials, cookies, sessions, authorization headers, and full sensitive request bodies are absent.