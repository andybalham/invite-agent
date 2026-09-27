---
id: S-005
type: story
title: Create and edit draft details with safe location Markdown
parent: E-002
dependsOn: [S-004]
estimate: 3
tags: [e2e, location, organiser, security]
archived: false
created: 2026-09-27T18:06:59.010Z
updated: 2026-09-27T18:06:59.010Z
---
Outcome:
Create and edit draft details with safe location Markdown.

Source:
US-01, US-35, US-37

Acceptance criteria:
- The owner can create and revisit a Draft with required and optional details.
- Location accepts at most 4,000 Unicode code points and the approved Markdown subset with HTTPS links.
- Raw HTML, unsafe schemes, unsafe rendered content, and excessive input are rejected without changing stored/rendered data or adding audit history.
- Preview and saved views render sanitised content; contract and Playwright tests cover valid and hostile examples.