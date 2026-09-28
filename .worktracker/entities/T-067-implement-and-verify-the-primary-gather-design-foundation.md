---
id: T-067
type: task
title: Implement and verify the primary Gather design foundation
parent: S-032
status: done
dependsOn: [T-066]
estimate: 4
tags: [accessibility, design, e2e, frontend, green, responsive]
archived: false
created: 2026-09-28T18:19:46.545Z
updated: 2026-09-28T18:30:46.490Z
---
Implementation scope:
Refactor the existing frontend to match the primary references in `.docs/design` while preserving the completed draft-details behavior and establishing reusable components/tokens for later stories.

Acceptance criteria:
- Implement the Modernist design tokens, Archivo typography, Gather app chrome, documented content width, rules, square controls, buttons, fields, status treatments, safe-location presentation, focus behavior, and responsive layout.
- Replace the current conflicting visual language and copy rather than layering the new design over it.
- Keep server integration, sanitised location Markdown, recoverable validation input, draft persistence, and accessibility working.
- The tests from T-066 and the relevant regression suites pass; changed files and exact verification commands are recorded as evidence.