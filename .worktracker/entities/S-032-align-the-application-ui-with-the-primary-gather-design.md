---
id: S-032
type: story
title: Align the application UI with the primary Gather design
parent: E-002
dependsOn: [S-005]
estimate: 5
tags: [accessibility, design, e2e, frontend, responsive]
archived: false
created: 2026-09-28T18:19:30.218Z
updated: 2026-09-28T18:19:30.218Z
---
Outcome:
Replace the current divergent frontend styling and draft experience with the primary UI and interaction language defined in `.docs/design`, establishing that design as the baseline for all later user-facing work.

Source:
`.docs/design/README.md`; `.docs/design/Gather Prototype.dc.html`; chosen ranking-first direction in `.docs/design/Poll Wireframes.dc.html`; applicable requirements and acceptance use cases.

Design authority:
- `.docs/design/README.md` and `Gather Prototype.dc.html` are the primary sources for user-facing layout, copy, states, flows, responsive behavior, and Modernist tokens.
- `Poll Wireframes.dc.html` contributes the chosen "1b — ranking-first" direction for the poll page.
- `.docs/user-requirements.md` and `.docs/acceptance-use-cases.md` remain the functional source of truth; when they conflict with prototype behavior or validation limits, the requirements win.
- The black prototype control bar is reference-only and must not be implemented.

Acceptance criteria:
- Existing frontend chrome and the implemented draft-details screen use the Gather wordmark, Archivo typography, Modernist palette/tokens, 920px content rhythm, square components, spacing, borders, focus treatment, responsive behavior, and design copy/hierarchy from the reference.
- The current custom Fraunces/DM Mono, green/acid/rust visual direction and "Shape the plan" presentation are removed rather than retained as a parallel theme.
- Reusable UI foundations are introduced for buttons, inputs, tags, alerts, tables, dialogs, toasts, headers, and section rules so pending stories extend one coherent system.
- Existing draft creation/editing, safe location preview, validation, saved-state, accessibility, and API behavior remain intact; functional rules follow the requirements where the prototype differs.
- Automated browser tests cover representative desktop/mobile layout, design-critical copy and states, keyboard focus, and functional regression behavior.