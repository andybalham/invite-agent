---
id: S-018
type: story
title: Undo an isolated change with a compensating revision
parent: E-006
dependsOn: [S-017]
estimate: 3
tags: [audit, domain, e2e, undo]
archived: false
created: 2026-09-27T18:07:00.085Z
updated: 2026-09-27T18:07:00.085Z
---
Outcome:
Undo an isolated change with a compensating revision.

Source:
US-21

Acceptance criteria:
- The owner can preview and confirm inversion of a reversible event with no later overlap.
- Undo restores prior state, recomputes totals and live ranking, and leaves the original event unchanged.
- Exactly one newer UNDO event references the original and records restored before/after values.
- Domain, repository, contract, and browser tests cover update, add, and delete inversions.