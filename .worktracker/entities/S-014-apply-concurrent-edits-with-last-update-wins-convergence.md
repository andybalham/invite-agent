---
id: S-014
type: story
title: Apply concurrent edits with last-update-wins convergence
parent: E-004
dependsOn: [S-013]
estimate: 4
tags: [concurrency, e2e, integration, last-update-wins]
archived: false
created: 2026-09-27T18:06:59.751Z
updated: 2026-09-27T18:06:59.751Z
---
Outcome:
Apply concurrent edits with last-update-wins convergence.

Source:
US-16; architecture §§5.1, 9

Acceptance criteria:
- Mutation requests contain no expected-version precondition and overlapping accepted writes produce no conflict warning.
- Internal transaction contention is retried against current state within a bounded policy.
- The last successfully committed overlapping value is the stored value and each accepted mutation has a separate audit revision.
- Controlled two-context integration and Playwright tests prove both clients converge when they observe the newer version.