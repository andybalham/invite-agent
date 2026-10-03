---
id: T-110
type: task
title: Add browser tests for organiser landing create return and public-link isolation
parent: S-045
status: todo
dependsOn: [T-106, T-109]
tags: [authorization, e2e, my-polls, navigation]
archived: false
created: 2026-10-03T16:43:22.327Z
updated: 2026-10-03T16:43:22.327Z
---
Add and run Playwright cases for normal organiser landing, Create poll opening existing flow, saving a valid draft and returning via My polls, return links from directly opened Draft/Open/Closed organiser views, and successful publication staying on management with share link. Use separate organiser and unauthenticated public contexts; prove a current public link opens its poll directly and cannot request the organiser list or manage another organiser's poll. Assert semantic route/page content and unchanged audit counts for navigation. Full title-link clicks with real table/cards and new-draft summary visibility are covered by the responsive/lifecycle stories.