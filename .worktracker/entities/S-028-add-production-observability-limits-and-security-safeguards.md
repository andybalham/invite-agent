---
id: S-028
type: story
title: "Add production observability, limits, and security safeguards"
parent: E-008
dependsOn: [S-026]
estimate: 3
tags: [cloudwatch, design-authority, observability, operations, security]
archived: false
created: 2026-09-27T18:07:00.844Z
updated: 2026-09-28T18:20:22.164Z
---
Outcome:
Add production observability, limits, and security safeguards.

Source:
Architecture §§11–13

Acceptance criteria:
- Structured logs include correlation, route, status, latency, actor category, poll ID, version, and error code while excluding sensitive bodies/tokens.
- Explicit log retention, encryption, concurrency/cost limits, API throttles, and bounded poll sizes are configured.
- Dashboards and alarms cover API, Lambda, DynamoDB, CloudFront, Cognito aggregates, and synthetic health; alarms publish to a required SNS destination.
- Infrastructure tests verify security headers, encryption, least privilege, retention, alarms, and the absence of public S3 access.

Design authority:
- For any user-facing UI this story creates, changes, serves, or verifies, `.docs/design/README.md` and `.docs/design/Gather Prototype.dc.html` are the primary sources for layout, copy, states, flows, responsive behavior, and Modernist tokens; use the chosen "1b — ranking-first" direction from `Poll Wireframes.dc.html` where applicable.
- Requirements and acceptance use cases remain the functional source of truth when behavior or validation limits conflict with the prototype, and the prototype-only black control bar must not be implemented.
- Acceptance evidence for UI-bearing work must cover applicable design hierarchy, copy, interaction states, accessibility, and responsive behavior, reusing the foundation established by S-032 rather than introducing a competing visual system.