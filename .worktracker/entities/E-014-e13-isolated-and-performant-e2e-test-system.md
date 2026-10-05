---
id: E-014
type: epic
title: "E14 — Isolated and performant E2E test system"
parent: null
dependsOn: [E-012]
estimate: 8
tags: [cleanup, dynamodb, e2e, isolation, performance, playwright, testing]
archived: false
created: 2026-10-05T18:49:40.547Z
updated: 2026-10-05T18:52:00.541Z
---
Deliver a fast, repeatable, and isolated Playwright E2E test system before production platform work.

Scope:
- Run ordinary E2E tests against unique per-run application and audit tables rather than the shared browser-development tables.
- Provision, identify, and tear down only tables owned by the current E2E run, including failure-path cleanup and diagnostics.
- Reduce long runtimes caused by repeated HTTP seeding, duplicated desktop/mobile setup, excessive full-partition snapshots, and oversized acceptance cases.
- Preserve meaningful live API, browser, pagination, accessibility, lifecycle, authorization, and responsive coverage.
- Separate fast default E2E regression checks from exhaustive discovery/performance cases.
- Document commands, table ownership, cleanup recovery, and measurable runtime expectations.

Acceptance:
- A normal `npm run test:e2e` run cannot write to `invite-agent-local-app` or `invite-agent-local-audit` unless explicitly opted into a legacy/shared mode.
- Successful, failed, timed-out, and interrupted runs leave no owned E2E tables or records behind where cleanup is possible, while preserving reports and logs.
- E2E setup uses efficient deterministic fixtures and avoids unnecessary repeated live HTTP creation and full-partition verification.
- Desktop/mobile and exhaustive discovery coverage remain explicit and traceable, with a fast default suite and separately runnable heavy suites.
- Repeatability, isolation, cleanup failure handling, and performance are verified in automated tests and documented before E-008 begins.

This epic is planned work only; creating it does not start implementation.