---
id: T-112
type: task
title: Specify equivalent desktop and mobile summaries with component tests
parent: S-046
status: done
dependsOn: [T-107, T-111]
tags: [component-test, my-polls, responsive, unit-test]
archived: false
created: 2026-10-03T16:43:22.522Z
updated: 2026-10-04T13:39:42.216Z
---
Write failing tests for compact semantic desktop table and mobile cards showing identical linked title, lifecycle label, creation date, proposed dates and participant count. Cover incomplete Draft with no dates, zero participants, long titles, date-only/timed values and approved summary formatting. Assert My polls heading, prominent Create poll, accessible structure/links and keyboard navigation. Test data/loading/empty/error branches with agreed semantics and mock API fixtures; avoid exact unspecified wording or invented breakpoints.