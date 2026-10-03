---
id: T-102
type: task
title: Build isolated two-organiser dashboard fixtures and verify teardown
parent: S-044
status: todo
dependsOn: [T-101]
tags: [integration-test, isolation, my-polls, test-fixtures]
archived: false
created: 2026-10-03T16:43:21.573Z
updated: 2026-10-03T16:44:33.535Z
---
Extend established test helpers with two organiser identities, each owning Draft/Open/Closed polls with distinct creation times, identical and distinct titles, known proposed dates and participant counts, incomplete drafts, and enough records to traverse database pagination. Preserve Epics 10/11 ownership markers and finally-path teardown, including failed assertions. Do not seed shared development data or require production sign-in. Verify fixture isolation and teardown through the existing harness; use fixtures for repository/API tests and selective browser search/order matrices, while creating polls through UI for lifecycle journeys.