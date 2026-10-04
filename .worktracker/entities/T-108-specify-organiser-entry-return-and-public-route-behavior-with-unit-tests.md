---
id: T-108
type: task
title: Specify organiser entry return and public route behavior with unit tests
parent: S-045
status: done
dependsOn: [T-101]
tags: [my-polls, navigation, unit-test]
archived: false
created: 2026-10-03T16:43:22.128Z
updated: 2026-10-04T09:13:23.128Z
---
Write failing router/component tests for normal organiser entry -> My polls; Create poll -> existing creation; Draft title destination -> editor and Open/Closed -> management; visible My polls return targets; publication -> management with share link. Test direct organiser paths and direct public capability routes so organiser landing logic never intercepts an unauthenticated public link. Cover empty simulated identity and identity change according to existing auth behavior without inventing sign-in policy. Use controlled route/list fixtures so routing can be developed in parallel with API work.