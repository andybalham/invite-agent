---
id: T-087
type: task
title: Verify explicit-poll and run-ID cleanup across paginated data
parent: S-039
status: done
dependsOn: [T-085]
tags: [cleanup, testing]
archived: false
created: 2026-10-03T10:16:13.358Z
updated: 2026-10-03T14:54:02.835Z
---
Exercise cleanup with multiple participants, name indexes, public-token records, and enough audit events to cover pagination. Confirm explicit poll deletion and run-ID clear-down remove all related records while preserving unrelated polls and audit history.