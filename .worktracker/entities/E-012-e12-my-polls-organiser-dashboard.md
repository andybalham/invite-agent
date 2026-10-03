---
id: E-012
type: epic
title: "E12 — My polls organiser dashboard"
parent: null
dependsOn: [E-011]
tags: [dashboard, documentation, my-polls, organiser, security, testing]
archived: false
created: 2026-10-03T16:37:59.188Z
updated: 2026-10-03T16:37:59.188Z
---
Deliver My polls as the normal organiser landing page and entry point into existing poll workflows.

Authoritative scope: .docs/user-requirements-my-polls.md sections 1–6 and .docs/acceptance-use-cases-my-polls.md MP-UC-01–03 / MP-US-01–11, supplemented by .docs/user-requirements.md, .docs/acceptance-use-cases.md, .docs/architecture.md and the registered project requirements.

Acceptance:
- Return only the current organiser's polls using server-enforced authenticated ownership; respect the guarded local simulated identity and production verified identity.
- Show a prominent Create poll action, title links, Draft/Open/Closed status, creation date, proposed dates and participant count in a desktop compact table and equivalent mobile cards.
- Select Active (Draft + Open) by default; provide Draft/Open/Closed filters and title search within the current filter; order newest-created first. Closed appears only in Closed. Active is not a stored lifecycle state.
- Reuse create/edit/manage/publish/close/reopen workflows; provide an obvious My polls return link; remain on management after publication; retain original creation dates and ordering through edits and lifecycle changes.
- Preserve direct unauthenticated public-link access and deny public-link access to organiser listing or management.
- Dashboard reads/navigation/search/filtering create no mutations or audit revisions; lifecycle actions retain existing audit and authorization rules.
- Resolve, document and test unspecified search semantics, creation/proposed-date presentation, pagination/storage strategy and empty/loading/error copy before dependent implementation. These are implementation decisions, not added requirements.
- Complete foundation/unit/domain/contract, DynamoDB/server/API authorization, responsive browser/E2E, smoke regression and documentation traceability.

Exclude shared ownership, transfer, site administration, archiving, duplication, reminders and bulk actions. Do not add stale-link recovery requirements. Parent hierarchy is epic -> story -> task; all dependencies are same-type. This epic follows completed E-011 and precedes production platform E-008, following existing board sequencing. New tasks remain todo; creation of this plan does not start implementation.