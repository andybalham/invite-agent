---
id: T-047
type: task
title: Implement and verify closed-state enforcement and frozen results
parent: S-022
status: done
dependsOn: [T-046]
estimate: 2
tags: [green, implementation, S-022]
archived: false
created: 2026-09-27T18:08:42.382Z
updated: 2026-10-01T18:57:16.514Z
---
Implementation scope:
Implement closed public result, frozen-ranking reads, UI control removal, and server rejection of participant/date mutations.

Acceptance criteria:
- Selected result stays primary and stable across reloads; rejected writes return 422 and change no state, ranking, totals, or history; tests pass.
- Every acceptance criterion in parent story S-022 is satisfied without weakening or deleting the red tests.
- Targeted tests and the relevant regression suite are green.
- Static analysis, security checks, and accessibility checks applicable to the slice pass.
- Changed files, exact verification commands, and results are attached as evidence.