---
id: S-048
type: story
title: Reflect create publish close and reopen workflows in My polls
parent: E-012
dependsOn: [S-046]
tags: [e2e, integration-test, lifecycle, my-polls]
archived: false
created: 2026-10-03T16:38:57.544Z
updated: 2026-10-03T16:38:57.544Z
---
Deliver MP-US-07–10 by integrating the dashboard with existing create, draft editing, organiser management, publication, close and reopen flows. Returning shows saved summaries and current participant counts/state. Publication stays on management with the public link. Closure removes a poll from Active/Open and adds it to Closed; reopening reverses this. Editing, publishing, closing and reopening retain original creation date and creation-based ordering. Refresh according to an explicit existing-compatible strategy without introducing real-time subscriptions. Retain confirmation, read-only restrictions, ownership and lifecycle audit rules; dashboard reads add no revisions.