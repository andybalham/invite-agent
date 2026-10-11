---
id: S-061
type: story
title: Verify the complete My polls improvement journey
parent: E-016
dependsOn: [S-059, S-060]
estimate: 3
tags: [acceptance-tests, documentation, regression]
archived: false
created: 2026-10-11T07:55:22.322Z
updated: 2026-10-11T07:55:22.322Z
---
Add integrated automated coverage and traceability for the completed design.

Acceptance criteria, verified by automated tests:
- Component tests cover compact summaries, date disclosure, large date sets, loading/errors and search debounce.
- Browser tests cover desktop and mobile dashboard layouts with many dates.
- Browser tests cover publication landing, organiser share controls, copy/open actions, closed-poll sharing and confirmed rotation.
- Browser tests prove dashboard navigation remains available without dashboard-owned share state.
- Existing My polls lifecycle, navigation guard, search, pagination, public-link isolation and regression suites pass.
- The design document and relevant requirements/acceptance references identify the implemented behaviour and test commands.
- The targeted verification command produces a non-zero exit code on any failed assertion and leaves no new test-only data behind.