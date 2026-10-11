---
id: S-060
type: story
title: Make the poll-management page the canonical public-link surface
parent: E-016
dependsOn: [S-058]
estimate: 5
tags: [browser-tests, organiser, security, sharing]
archived: false
created: 2026-10-11T07:55:22.244Z
updated: 2026-10-11T07:55:22.244Z
---
Move public-link management from individual My polls results to the actual organiser poll-management page.

Acceptance criteria, verified by automated tests:
- My polls does not create or render an independent share-link panel for each result.
- The organiser poll page provides a prominent Share poll section with copy, open-as-participant and current-link retrieval behaviour.
- Draft polls do not expose public-link controls before publication.
- Open and closed polls allow the organiser to copy the current link.
- Link rotation remains behind the security disclosure/confirmation and invalidates the old link immediately.
- Rotation retains dates, responses, history and lifecycle state.
- Unauthenticated link-holder views never expose organiser-only share, history, edit, close or reopen controls.
- After publication, the organiser lands on the poll page with share controls available and focus/status feedback is testable.
- Existing owner isolation and token-secrecy contracts remain green.