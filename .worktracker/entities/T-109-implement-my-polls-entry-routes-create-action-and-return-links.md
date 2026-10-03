---
id: T-109
type: task
title: Implement My polls entry routes create action and return links
parent: S-045
status: todo
dependsOn: [T-108]
tags: [frontend, implementation, my-polls, navigation]
archived: false
created: 2026-10-03T16:43:22.215Z
updated: 2026-10-03T16:43:22.215Z
---
Add the organiser My polls route/page shell and set normal organiser entry to it using existing routing/authentication conventions. Expose Create poll above the future list, route owned titles through a lifecycle-aware destination helper, and add obvious My polls links to the existing editor and organiser management views. Return newly saved drafts to default Active as specified; publication remains on management with its share link. Preserve deep/public routes and existing access checks. Pass routing/component tests without implementing new onboarding or management actions.