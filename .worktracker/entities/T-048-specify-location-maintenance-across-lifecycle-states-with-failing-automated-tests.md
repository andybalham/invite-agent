---
id: T-048
type: task
title: Specify location maintenance across lifecycle states with failing automated tests
parent: S-023
status: done
dependsOn: [T-043, T-047]
estimate: 1
tags: [red, S-023, test-first]
archived: false
created: 2026-09-27T18:08:42.443Z
updated: 2026-10-02T16:20:02.188Z
---
Purpose:
Lock S-023 / US-35–US-38 location maintenance before implementation.

Acceptance criteria:
- Automated state-matrix contract/security and Playwright tests encode S-023 happy paths, invalid input, ownership, concurrent audited writes, safe projections, privacy, responsive dialog and accessibility.
- Isolated fixtures assert state, stored content and exact audit effects.
- Capture genuine absent-behavior red and exact commands/references; no protected-branch merge before green.

Evidence (2026-10-02):
- Added test/integration/location-maintenance.test.mjs: nine Draft/Open/Closed state-matrix tests for set/edit/clear, sanitised immediate reads, before/after events, immutable prior events, frozen result preservation, invalid and unauthorized no-ops, rejected public-route bypass, concurrent serialization.
- Added test/e2e/location-maintenance.spec.ts: three state workflows for safe links/emphasis, immediate preview/public rendering, clear, retained invalid input, unchanged history, owner-only toolbar, mobile dialog and Escape.
- Functional references: .docs/user-requirements.md Location Details, Validation and Error Handling; .docs/acceptance-use-cases.md US-35–US-38; S-023.
- Design references: .docs/design/README.md and Gather Prototype.dc.html location dialog and organiser toolbar, using S-032 Modernist foundation.
- node --test test/integration/location-maintenance.test.mjs: exit 1, 0 passed / 9 failed; setup succeeded, absent PUT organiser location route returned 404 instead of 200.
- node node_modules/@playwright/test/cli.js test test/e2e/location-maintenance.spec.ts --workers=1 --timeout=10000: exit 1, 1 passed / 2 failed; Draft existing behavior passes; Open/Closed fail on absent Edit location control, after successful setup and public page load. Preceding selector errors corrected before this final red run.
- Harness started with approved Start-DevStack.ps1 -SkipBuild after starting Docker Desktop. Initial infrastructure failures are excluded from red evidence.
- No commits/merges performed.