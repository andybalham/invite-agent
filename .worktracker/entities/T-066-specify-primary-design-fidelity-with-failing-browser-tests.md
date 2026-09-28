---
id: T-066
type: task
title: Specify primary-design fidelity with failing browser tests
parent: S-032
status: done
dependsOn: []
estimate: 1
tags: [design, e2e, red, test-first, visual-regression]
archived: false
created: 2026-09-28T18:19:35.543Z
updated: 2026-09-28T18:25:29.121Z
---
Purpose:
Lock the primary design contract before changing the frontend.

Acceptance criteria:
- Browser tests encode the applicable Gather chrome, draft layout, Modernist tokens, Archivo typography, exact design-critical copy, focus states, and responsive behavior.
- Tests explicitly reject the current divergent theme and preserve existing functional, accessibility, security, and draft-persistence behavior.
- Representative desktop and mobile evidence is captured.
- A red run demonstrates failure because the current UI diverges from `.docs/design`, not because the harness is broken.