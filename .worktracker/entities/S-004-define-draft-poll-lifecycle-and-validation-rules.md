---
id: S-004
type: story
title: Define draft poll lifecycle and validation rules
parent: E-002
dependsOn: [S-003]
estimate: 2
tags: [domain, property-test, unit-test, validation]
archived: false
created: 2026-09-27T18:06:58.931Z
updated: 2026-09-27T18:06:58.931Z
---
Outcome:
Define draft poll lifecycle and validation rules.

Source:
US-01, US-03, US-04; requirements §§3–4, 12

Acceptance criteria:
- Tests specify Draft/Open/Closed transitions and reject invalid transitions.
- A draft requires a non-empty title and valid IANA time zone; optional description, instructions, and location may be empty.
- Publication validation requires at least two distinct valid choices.
- Stable validation codes preserve recoverable input and expose no internal details.