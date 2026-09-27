---
id: S-011
type: story
title: View responses and add a validated participant row
parent: E-004
dependsOn: [S-009]
estimate: 4
tags: [e2e, participants, validation]
archived: false
created: 2026-09-27T18:06:59.508Z
updated: 2026-09-27T18:06:59.508Z
---
Outcome:
View responses and add a validated participant row.

Source:
US-08–US-11

Acceptance criteria:
- The open public table displays every participant and every Yes/No value.
- Adding a trimmed non-empty name of at most 100 Unicode code points creates one row with all cells No and one anonymous audit revision.
- Internal whitespace is preserved; uniqueness uses NFKC plus locale-independent case folding.
- Blank, excessive, canonically/case-equivalent duplicate names and non-Yes/No values are rejected with no state or audit change.