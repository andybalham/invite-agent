---
id: T-164
type: task
title: Specify canonical poll-page sharing and owner-isolation acceptance tests
parent: S-060
status: done
dependsOn: []
estimate: 2
tags: [security, sharing, tests]
archived: false
created: 2026-10-11T07:56:50.474Z
updated: 2026-10-11T11:13:43.396Z
---
Add failing-first component/API/browser coverage for the poll-page share surface.

Acceptance criteria:
- Tests define organiser states for draft, open and closed polls.
- Tests define copy, open-as-participant, retrieve-current-link and rotate-link outcomes.
- Tests assert draft controls are absent before publication.
- Tests assert non-owner/link-holder views cannot access organiser share controls.
- Tests assert rotation confirmation, old-link invalidation and preservation of poll data.
- Tests assert publication lands the organiser on the poll page with share controls available.