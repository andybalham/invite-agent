---
id: T-051
type: task
title: Implement and verify reopen and close-again lifecycle
parent: S-024
status: done
dependsOn: [T-050]
estimate: 2
tags: [green, implementation, S-024]
archived: false
created: 2026-09-27T18:08:42.676Z
updated: 2026-10-02T16:59:08.905Z
---
Implementation scope:
Implement confirmation UI and atomic reopen, provisional selection, live ranking restoration, later same/different close, and history rendering.

Acceptance criteria:
- Cancel is a no-op; reopen and each close have separate required events; editability/ranking switch correctly; full journey passes.
- Every acceptance criterion in S-024 / US-28–US-30 is satisfied without weakening or deleting the red tests.
- Targeted tests and relevant regressions are green.
- Static analysis, security checks, and applicable accessibility checks pass.

Implementation evidence (2026-10-02):
- Added owner-only confirmed POST /api/organiser/polls/:id/reopen; version-guarded DynamoDB transaction saves Open + retained provisional selectedDateId and one POLL_REOPENED audit revision atomically, removes frozen ranking, preserves token/participants/history. Duplicate/concurrent confirmation has one winner.
- Existing close clears provisional state and captures a new ranking snapshot and distinct POLL_CLOSED revision. Same/different selections both covered.
- Gather prototype-aligned Reopen poll… confirmation dialog, Cancel/Escape/backdrop support, busy/error handling, initial/return focus, provisional panel above live ranking, restored collaboration controls and meaningful immutable history summary. No prototype control bar. Explicit hidden CSS and Closed-only final header highlight fixed through browser/screenshot checks.
- README documents confirmation/cancellation, provisional date, restored collaboration, later selection and distinct retained history.

Exact verification commands:
- `npm run build`: passed.
- `node --test test/foundation/reopening.test.mjs test/integration/reopening.test.mjs`: 6/6 passed.
- `npm run check`: passed after final edits; 52/52 foundation plus format/lint/typecheck/production boundaries/security.
- `node --test test/integration/*.test.mjs`: 45/45 passed.
- `node node_modules/@playwright/test/cli.js test test/e2e/reopening.spec.ts test/e2e/closing.spec.ts test/e2e/closed-state.spec.ts test/e2e/location-maintenance.spec.ts test/e2e/live-ranking.spec.ts test/e2e/audit-history.spec.ts test/e2e/undo.spec.ts test/e2e/design-fidelity.spec.ts --workers=1`: 17/17 passed.
- `node node_modules/@playwright/test/cli.js test test/e2e/reopening.spec.ts --workers=1`: 2/2 passed after final screenshot-driven Closed-only header highlight correction. That stricter assertion first failed deterministically (expected 0 final-date-cell, received 1) before fixing the condition.
- `git diff --check`: passed (Git emits platform LF/CRLF warnings only).

Accessibility/design evidence:
Desktop and 390px mobile same/different full journeys verify named dialog and region, focused confirmation and returned focus after cancellation, Enter/Escape/Space keyboard operation, cross-client live state, no document overflow, dashed provisional styling above ranking, final poster visibility transition and accessible history row headers. Reviewed desktop/mobile screenshots attached to Playwright report. Corrected history selector from cell to existing rowheader semantics without changing history expectations.

Changed implementation files:
README.md; packages/contracts/src/index.ts; backend/src/application/poll-service.ts; backend/src/data/types.ts; backend/src/data/dynamodb-poll-repository.ts; backend/src/http/shared-handler.ts; frontend/src/main.ts; frontend/src/styles.css; test/foundation/reopening.test.mjs; test/integration/reopening.test.mjs; test/e2e/reopening.spec.ts.

T-050 holds original red evidence. No commits; no other story or Epic 8 work.