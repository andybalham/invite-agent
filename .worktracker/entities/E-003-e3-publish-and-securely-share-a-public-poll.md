---
id: E-003
type: epic
title: "E3 — Publish and securely share a public poll"
parent: null
dependsOn: [E-002]
estimate: 9
tags: [e2e, public-link, publishing, security]
archived: false
created: 2026-09-27T18:05:21.396Z
updated: 2026-09-27T18:05:21.396Z
---
Visible deliverable:
An organiser can publish a valid draft, copy a high-entropy public link, and open a safe read-only public poll view in a fresh unauthenticated browser while drafts and organiser operations remain protected.

Acceptance criteria:
- Publishing atomically changes Draft to Open, creates one audit revision, and issues a 192-bit Base64URL token whose raw value is never persisted or logged.
- The current link resolves the public poll without participant authentication; unpublished drafts are never disclosed.
- Poll details, safely rendered location, ordered dates, lifecycle state, and shared-data notice are visible.
- Organiser identity and audit data are absent from public responses.
- Server-side authentication and ownership checks protect every organiser route.
- Stable error codes and non-sensitive messages match the resolved contract.
- Contract, security, and Playwright tests demonstrate the behavior before the epic is complete.