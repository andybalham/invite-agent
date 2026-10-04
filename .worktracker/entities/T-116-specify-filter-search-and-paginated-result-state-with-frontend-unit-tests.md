---
id: T-116
type: task
title: Specify filter search and paginated result state with frontend unit tests
parent: S-047
status: done
dependsOn: [T-115]
tags: [component-test, my-polls, search, unit-test]
archived: false
created: 2026-10-03T16:43:22.905Z
updated: 2026-10-04T14:44:18.301Z
---
Write failing frontend query/controller/component tests for Active default, Draft/Open/Closed selection, retained search on filter changes, clear search, no-match recovery and resolved title matching. Verify the client preserves globally creation-ordered server results rather than reordering by activity. Test request parameters, response races during rapid query changes and cursor/page reset or combination according to the approved pagination design. Ensure Active is never serialized as a persisted poll lifecycle and controls do not create mutations/audit revisions.