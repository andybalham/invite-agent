---
id: E-016
type: epic
title: Improve My polls usability and centralize public-link management
parent: null
dependsOn: []
estimate: 13
tags: [accessibility, frontend, my-polls, usability]
archived: false
created: 2026-10-11T07:55:14.533Z
updated: 2026-10-11T07:55:14.533Z
---
Implement the first-release design documented in .docs/26-10-11-my-polls-improvements.md.

Outcome:
- My polls remains a fast discovery and navigation surface even when polls contain many proposed dates.
- Date details are progressively disclosed without truncation or data loss.
- The poll-management page is the single canonical place for organiser public-link management.
- Desktop, mobile, keyboard and screen-reader experiences are covered by automated tests.

Scope:
- Compact date summaries, counts and accessible disclosure/dialog behaviour.
- Responsive dashboard hierarchy and actions.
- Loaded-result feedback and debounced title search.
- Poll-page share controls for copy, open-as-participant and link rotation.
- Removal of the dashboard-owned share workflow.
- Automated unit, component and browser acceptance coverage.

Reference: .docs/26-10-11-my-polls-improvements.md