---
id: S-062
type: story
title: Restore green My polls regression and test-harness suites
parent: E-016
dependsOn: []
estimate: 5
tags: [component-tests, e2e, integration, my-polls, regression]
archived: false
created: 2026-10-11T11:43:14.102Z
updated: 2026-10-11T11:43:14.102Z
---
Fix every currently failing non-exhaustive test before continuing work beyond E-016.\n\nKnown failures from the latest verification:\n- Serial My polls component tests whose selectors still assume one title link per result while the dashboard renders the approved Open poll action.\n- T-122 lifecycle-summary integration expectations that omit finalDate for closed polls.\n- E2E cleanup and runner integration harness failures involving missing test discovery and missing run-summary assertions.\n\nAcceptance criteria:\n- The full serial component suite passes without weakening the canonical poll-page sharing contract.\n- The full integration suite passes, including closed-poll finalDate projections and E2E cleanup/runner harness coverage.\n- Non-exhaustive focused E2E suites pass with valid run evidence and no stale-process or port-collision workarounds.\n- Existing owner isolation, token secrecy, public-link rotation, and S-060 acceptance tests remain green.\n- Verification commands and any required environment prerequisites are documented in the task evidence.