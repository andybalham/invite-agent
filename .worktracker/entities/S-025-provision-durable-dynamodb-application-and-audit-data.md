---
id: S-025
type: story
title: Provision durable DynamoDB application and audit data
parent: E-008
dependsOn: [S-024]
estimate: 3
tags: [aws, cdk, design-authority, dynamodb, infrastructure-test]
archived: false
created: 2026-09-27T18:07:00.625Z
updated: 2026-09-28T18:20:21.992Z
---
Outcome:
Provision durable DynamoDB application and audit data.

Source:
Architecture §§5.5, 9, 15

Acceptance criteria:
- CDK provisions separate encrypted on-demand app and audit tables with required keys/indexes and point-in-time recovery.
- Production removal/retention policies protect current and append-only audit data.
- The deployed schema supports owner listing, active-token lookup, name locks, transactional mutations, ordered history, and frozen ranking.
- CDK assertions and DynamoDB Local parity tests verify the schema and permissions.

Design authority:
- For any user-facing UI this story creates, changes, serves, or verifies, `.docs/design/README.md` and `.docs/design/Gather Prototype.dc.html` are the primary sources for layout, copy, states, flows, responsive behavior, and Modernist tokens; use the chosen "1b — ranking-first" direction from `Poll Wireframes.dc.html` where applicable.
- Requirements and acceptance use cases remain the functional source of truth when behavior or validation limits conflict with the prototype, and the prototype-only black control bar must not be implemented.
- Acceptance evidence for UI-bearing work must cover applicable design hierarchy, copy, interaction states, accessibility, and responsive behavior, reusing the foundation established by S-032 rather than introducing a competing visual system.