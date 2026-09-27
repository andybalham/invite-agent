---
id: E-004
type: epic
title: "E4 — Collaborative availability table"
parent: null
dependsOn: [E-003]
estimate: 15
tags: [accessibility, availability, collaboration, concurrency, e2e]
archived: false
created: 2026-09-27T18:05:21.475Z
updated: 2026-09-27T18:05:21.475Z
---
Visible deliverable:
Multiple unauthenticated link holders can collaboratively maintain the same Yes/No availability table, with accessible autosaving controls, accurate totals, immutable revisions, and last-update-wins convergence without conflict warnings.

Acceptance criteria:
- All link holders can view all rows and add a uniquely named row whose cells default to No.
- Names follow trimming, 100-code-point, NFKC/case-fold uniqueness, and validation rules.
- Any link holder can rename or delete any row; deletion requires an exact current-name confirmation.
- Mouse click and keyboard Space toggle any cell and autosave without a separate save action.
- Every successful mutation creates exactly one audit revision; rejected mutations create none.
- Yes totals are correct after every change.
- Controlled concurrent edits prove the later accepted update wins, no conflict warning appears, and clients converge on the latest server state.
- Unit, integration, contract, accessibility, and multi-context Playwright tests pass.