---
id: T-123
type: task
title: Verify complete dashboard lifecycle journeys and public-link isolation in browsers
parent: S-048
status: todo
dependsOn: [T-117, T-122]
tags: [e2e, lifecycle, my-polls, security]
archived: false
created: 2026-10-03T16:43:23.537Z
updated: 2026-10-03T16:45:31.418Z
---
Automate MP-US-07–11 with real UI-created polls and separate organiser/link-holder contexts: Create -> save -> Active summary; title -> Draft editor; publish -> remain on management/share; return -> Open; close with existing confirmation -> absent Active/Open and present Closed; title -> Closed management; reopen with confirmation -> present Active/Open and absent Closed. Assert original creation date/order throughout and correct participant counts after collaboration. Keep mutation audit assertions and ensure navigation reads add none. Check direct public links during Open/Closed/reopened states preserve participant permissions and deny organiser listing. Include desktop/mobile coverage without multiplying unrelated existing regression scenarios.