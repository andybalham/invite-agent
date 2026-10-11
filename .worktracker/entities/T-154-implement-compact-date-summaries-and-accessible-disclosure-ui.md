---
id: T-154
type: task
title: Implement compact date summaries and accessible disclosure UI
parent: S-058
status: todo
dependsOn: [T-153]
estimate: 2
tags: [accessibility, dates, frontend]
archived: false
created: 2026-10-11T07:55:35.870Z
updated: 2026-10-11T07:55:35.870Z
---
Implement the summary projection and DOM/CSS behaviour required by T-153.

Acceptance criteria:
- Default result output shows a date count and bounded preview rather than every date.
- Small date sets expand inline through an accessible disclosure control.
- Large date sets use a labelled, keyboard-operable dialog or equivalent bounded disclosure.
- All dates remain available in saved order and no label is clipped or silently truncated.
- Existing date formatting and closed final-date semantics remain unchanged.
- T-153 passes for desktop and mobile render paths.