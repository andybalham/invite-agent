---
id: T-098
type: task
title: Resolve dashboard search date pagination and state-copy decisions
parent: S-043
status: todo
dependsOn: []
tags: [decision, documentation, my-polls]
archived: false
created: 2026-10-03T16:43:21.168Z
updated: 2026-10-03T16:43:21.168Z
---
Read both My polls supplements and existing Gather/date/auth conventions. Record explicit decisions in .docs/user-requirements-my-polls.md and .docs/acceptance-use-cases-my-polls.md: title case/partial/normalization semantics; creation-date and proposed-date presentation (date-only versus timed values and poll time zone); whether pagination is needed and its UX; semantic empty/no-match/loading/error states and copy. Define any return-state and equal-created-time behavior as implementation decisions rather than acceptance requirements. Preserve exact-title matching, Active default, search retained across filters and all exclusions. Update/add decision-specific acceptance cases only after resolving details; do not silently prescribe open details.