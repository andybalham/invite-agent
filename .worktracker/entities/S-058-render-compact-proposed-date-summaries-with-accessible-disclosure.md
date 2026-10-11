---
id: S-058
type: story
title: Render compact proposed-date summaries with accessible disclosure
parent: E-016
dependsOn: []
estimate: 5
tags: [accessibility, component-tests, dates, my-polls]
archived: false
created: 2026-10-11T07:55:22.086Z
updated: 2026-10-11T07:55:22.086Z
---
Implement the compact date presentation from .docs/26-10-11-my-polls-improvements.md.

Acceptance criteria, verified by automated tests:
- A poll with zero dates shows an explicit no-dates state.
- A poll with a small date set shows a bounded preview plus an accessible Show dates/Hide dates control.
- A poll with more than the configured large-set threshold exposes every saved date through a labelled dialog or equivalent bounded disclosure, without truncation.
- The date count is visible in the collapsed summary.
- Timed choices retain local time-zone and UTC-offset information.
- Closed polls expose the selected final date in the summary without relying on colour alone.
- Disclosure state, focus handling, keyboard activation and Escape/close behaviour are covered for desktop and mobile DOM variants.
- Existing saved order and date formatting rules remain unchanged.