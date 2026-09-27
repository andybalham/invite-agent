---
id: E-002
type: epic
title: "E2 — Organiser draft builder and preview"
parent: null
dependsOn: [E-001]
estimate: 12
tags: [backend, draft, e2e, frontend, organiser]
archived: false
created: 2026-09-27T18:05:21.307Z
updated: 2026-09-27T18:05:21.307Z
---
Visible deliverable:
An authenticated local organiser can create and revisit a private draft, edit event details and safe location Markdown, manage ordered date/date-time options including daylight-saving edge cases, preview the participant view, and see publication blocked until valid.

Acceptance criteria:
- Draft creation supports required title and time zone plus optional description, instructions, and location.
- Location limits, Markdown allow-list, HTTPS-link rule, sanitisation, and audit behaviour match the approved requirements.
- Date-only and timed choices are distinct; duplicates, invalid values, nonexistent local times, and unresolved ambiguous times are rejected.
- Dates can be added, edited, reordered, and removed while Draft.
- Preview is participant-like but private and non-editable.
- Publication readiness requires a valid title, time zone, and at least two distinct choices.
- Unit/property, DynamoDB integration, API contract, and Playwright tests are written test-first and pass.