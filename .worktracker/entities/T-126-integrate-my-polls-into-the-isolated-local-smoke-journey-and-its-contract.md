---
id: T-126
type: task
title: Integrate My polls into the isolated local smoke journey and its contract
parent: S-049
status: done
dependsOn: [T-124]
tags: [documentation, implementation, my-polls, smoke-test]
archived: false
created: 2026-10-03T16:43:24.012Z
updated: 2026-10-04T20:01:31.314Z
---
Extend the existing executable local smoke journey to begin at My polls, create/save/open/publish and return through the dashboard, then observe close/reopen list membership while retaining public collaboration/security checkpoints. Update .docs/local-smoke-test-contract.md to reflect changed entry/navigation and dashboard checkpoint traceability; keep detailed search/mobile permutations in dedicated E2E tests. Preserve per-run application/audit tables, run manifests, owned data cleanup and useful failure diagnostics from Epics 10/11. Verify repeated runs and failure teardown using established smoke harness; document any schema/index cleanup implications in relevant existing .docs guidance.