---
id: T-155
type: task
title: Verify long-date accessibility and responsive disclosure behaviour in browser tests
parent: S-058
status: done
dependsOn: [T-154]
estimate: 1
tags: [accessibility, browser-tests, mobile]
archived: false
created: 2026-10-11T07:55:35.944Z
updated: 2026-10-11T08:33:32.245Z
---
Add browser-level proof for large date sets.

Acceptance criteria:
- Desktop and narrow mobile tests create/render a poll with enough dates to cross the large-set threshold.
- Tests prove the default result stays compact.
- Tests open and close the full date list with mouse and keyboard.
- Tests verify focus behaviour, visible date labels, no page-level horizontal overflow and usable close/Escape behaviour.
- Tests exercise both draft/open/closed summary variants needed by the design.