---
id: E-010
type: epic
title: "E10 — Local onboarding and full-journey smoke testing"
parent: null
dependsOn: [E-007]
tags: [documentation, local-development, smoke-test, testing]
archived: false
created: 2026-10-03T09:02:04.327Z
updated: 2026-10-03T09:02:04.327Z
---
Create a verified local-development guide and an executable smoke test for Invite-a-Gent. The outcome must let a new developer run the application locally and run one deterministic smoke journey covering draft creation, publication, public participation, ranking, audit and undo, location handling, close/reopen lifecycle, and critical access-control behaviour. The smoke test must create or establish its own scripted initial data, isolate repeated runs, and retain useful diagnostics on failure.