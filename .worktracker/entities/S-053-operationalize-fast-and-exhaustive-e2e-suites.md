---
id: S-053
type: story
title: Operationalize fast and exhaustive E2E suites
parent: E-014
dependsOn: [S-052]
tags: [ci, documentation, e2e, playwright]
archived: false
created: 2026-10-05T18:50:09.243Z
updated: 2026-10-05T18:54:05.629Z
---
Make the revised E2E suite easy to run locally and in CI with clear suite boundaries and evidence.

Acceptance:
- npm scripts distinguish the fast default, smoke, discovery, and exhaustive suites.
- CI runs the intended isolated suite and retains diagnostics without retaining test data.
- Documentation explains table ownership, commands, cleanup recovery, and performance expectations.
- Repeatability and failure-path checks are automated and traceable.