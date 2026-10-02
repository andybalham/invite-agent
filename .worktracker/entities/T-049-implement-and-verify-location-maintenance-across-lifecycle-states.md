---
id: T-049
type: task
title: Implement and verify location maintenance across lifecycle states
parent: S-023
status: done
dependsOn: [T-048]
estimate: 2
tags: [green, implementation, S-023]
archived: false
created: 2026-09-27T18:08:42.515Z
updated: 2026-10-02T16:32:41.728Z
---
Implementation scope:
Allow owner location set/edit/clear in Draft/Open/Closed using shared server sanitisation, immediate projections, immutable audit, and ownership.

Acceptance criteria:
- State never changes; each success has one before/after event; invalid/unauthorized attempts are no-ops; matrix tests pass.
- S-023 acceptance satisfied without weakening T-048 tests.
- Targeted/regression tests and applicable static, security, accessibility/design checks pass.
- Changed files and exact verification commands/results attached.

Evidence (2026-10-02; S-023 / US-35–US-38):
- Added authenticated PUT /api/organiser/polls/{id}/location. PollService uses existing validateLocationMarkdown/renderSafeLocationMarkdown, authenticates owner before validation, strictly accepts one string field, retries version contention, and preserves all lifecycle/choice/frozen-result metadata.
- Repository commits version-checked poll and exactly one LOCATION_CHANGED audit atomically; events store previous/new location with empty values for set/clear. Existing Draft field saves remain audited POLL_DETAILS_UPDATED revisions.
- Owner controls are verified by the organiser read API; Open/Closed Location dialog reuses S-032 Modernist styling and prototype flow. Safe preview, Save location/Clear location/Cancel, native focus/Escape/backdrop cancellation, retained invalid text and alert; immediate complete public fetch after save; public background polling converges other clients. Explicit hidden toolbar styling keeps controls unavailable to public users/non-owners.
- README updated with user-facing location workflow, audit/state guarantees and supported safe Markdown/4,000-code-point limit.

Changed application/test files:
- backend/src/application/poll-service.ts
- backend/src/data/dynamodb-poll-repository.ts
- backend/src/data/types.ts
- backend/src/http/shared-handler.ts
- frontend/src/main.ts
- frontend/src/styles.css
- README.md
- test/integration/location-maintenance.test.mjs
- test/e2e/location-maintenance.spec.ts

Verification:
- & 'C:\nvm4w-monteith\nodejs\npm.cmd' run build: exit 0.
- node --test test/integration/location-maintenance.test.mjs: exit 0, 9/9 pass (Draft/Open/Closed set/edit/clear, safe projections, no-op invalid/auth paths, concurrent ordered audit).
- node node_modules/@playwright/test/cli.js test test/e2e/location-maintenance.spec.ts --workers=1: final exit 0, 3/3 pass. Includes native focus, preserved invalid source/history, owner-only visibility after page load, 375px no-overflow and Modernist zero-radius dialog, Escape and clear. Mobile Open/Closed screenshots attached to HTML report; Closed dialog visually inspected.
- & 'C:\nvm4w-monteith\nodejs\npm.cmd' run check: exit 0; formatting/lint/typecheck/build/production boundaries/security pass and all 50 foundation tests pass.
- node --test test/integration/*.test.mjs: exit 0, 41/41 pass.
- node node_modules/@playwright/test/cli.js test --workers=1: final exit 0, 32 passed / 1 intentional diagnostics test skipped / 0 failed (1.3 minutes).
- & 'C:\nvm4w-monteith\nodejs\npm.cmd' run format:check; & 'C:\nvm4w-monteith\nodejs\npm.cmd' run lint: final exit 0 after final UI/test polish.
- git diff --check: exit 0.
- MCP validate before completion: errors [], warnings [].

Regression discovery/remediation:
- Full browser runs identified generic participant error binding and broad hidden-dialog label collisions; implementation scoped binding and names inactive dialog only on opening, preserving all existing Draft tests. Stronger loaded-page ownership assertion found display:flex overriding hidden; explicit toolbar[hidden] rule corrected it. Final full suite passes without deleting/weaking behavior assertions.
- Browser execution and Docker/local services used approved escalated launches. Infrastructure/selector setup failures were excluded from T-048 genuine red evidence.
- No commit/merge performed. S-024/T-050 untouched; stop after S-023.