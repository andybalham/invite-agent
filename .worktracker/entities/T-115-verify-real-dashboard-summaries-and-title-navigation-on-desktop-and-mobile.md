---
id: T-115
type: task
title: Verify real dashboard summaries and title navigation on desktop and mobile
parent: S-046
status: todo
dependsOn: [T-114]
tags: [accessibility, e2e, my-polls, responsive]
archived: false
created: 2026-10-03T16:43:22.799Z
updated: 2026-10-03T16:45:18.377Z
---
Add/run browser tests on desktop and mobile viewports using known owned summaries. Verify compact table versus cards, all required content, creation order, Create poll and usable Draft/Open title links from Active to editor/management with visible My polls return. Use keyboard/semantic locators and long-title/date/count fixtures; confirm another organiser's entries are absent. Exercise agreed empty/loading/error/pagination behavior without asserting unspecified prose. Test Closed summary rendering with controlled component fixtures; defer the real Closed filter -> title -> management browser journey to T-118/T-123 once lifecycle filter controls exist. Complete MP-US-03 and the available MP-US-08 title navigation checks with real list rendering. Search/filter interaction and lifecycle refresh are covered by the following parallel stories.