---
id: T-156
type: task
title: Specify dashboard hierarchy pagination and debounced-search acceptance tests
parent: S-059
status: done
dependsOn: [T-154]
estimate: 2
tags: [pagination, responsive, search, tests]
archived: false
created: 2026-10-11T07:55:36.016Z
updated: 2026-10-11T08:54:07.015Z
---
Add failing-first component/browser coverage for the revised dashboard hierarchy and result feedback.

Acceptance criteria:
- Tests assert title, status, created date, date summary/count, participant count and Open poll action are prominent.
- Tests assert a loaded-result count is shown without implying an authoritative total.
- Tests cover cursor continuation, deduplication, loading, empty-with-continuation and later-page failure states.
- Tests assert search does not request once per keystroke and preserves filter/search semantics.
- Tests cover clear-search focus restoration, stale response protection and narrow viewport overflow.