---
id: S-052
type: story
title: Reduce E2E data setup and verification cost
parent: E-014
dependsOn: [S-051]
tags: [e2e, fixtures, performance, playwright]
archived: false
created: 2026-10-05T18:50:04.756Z
updated: 2026-10-05T18:54:05.555Z
---
Reduce the time spent creating and validating large browser-test datasets without weakening behavioural coverage.

Acceptance:
- Large datasets can be seeded efficiently through test-only helpers where HTTP creation is not under test.
- Full partition and audit snapshots are replaced by targeted invariants except in dedicated integrity tests.
- Desktop/mobile coverage does not duplicate expensive setup unnecessarily.
- Large discovery and sparse-pagination cases are separately runnable from the fast default regression suite.
- Performance measurements demonstrate a material reduction in local runtime.