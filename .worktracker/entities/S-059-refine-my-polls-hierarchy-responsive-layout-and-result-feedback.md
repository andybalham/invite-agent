---
id: S-059
type: story
title: "Refine My polls hierarchy, responsive layout and result feedback"
parent: E-016
dependsOn: [S-058]
estimate: 5
tags: [browser-tests, my-polls, pagination, responsive, search]
archived: false
created: 2026-10-11T07:55:22.166Z
updated: 2026-10-11T07:55:22.166Z
---
Refine the dashboard so the compact summary is the primary scanning experience.

Acceptance criteria, verified by automated tests:
- Desktop results prioritise title, status, created date, date count/preview, participant count and the Open poll action.
- Mobile cards remain compact when a poll contains many dates and do not render a long full date list by default.
- Result boundaries remain visually and semantically distinct after date disclosure.
- The dashboard reports the number of loaded results without presenting it as an authoritative total.
- Load more retains cursor pagination, deduplication, loading state, continuation state, empty-with-continuation state and later-page error handling.
- Search requests are debounced or submitted on Enter and do not issue one request per keystroke.
- Filter/search preservation, clear-search focus restoration and stale-response protection continue to pass.
- Narrow viewport browser tests prove no page-level horizontal overflow.