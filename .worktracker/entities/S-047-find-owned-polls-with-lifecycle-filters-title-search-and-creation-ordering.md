---
id: S-047
type: story
title: Find owned polls with lifecycle filters title search and creation ordering
parent: E-012
dependsOn: [S-046]
tags: [e2e, filters, my-polls, ordering, search]
archived: false
created: 2026-10-03T16:38:57.468Z
updated: 2026-10-03T16:38:57.468Z
---
Deliver MP-US-04–06: default Active includes Draft/Open; individual Draft/Open/Closed filters exclude other states; title search combines with the selected filter and remains when switching filters. Clearing search restores the chosen filter; no-match results allow changing/clearing search. Preserve server newest-created ordering and complete search/filter semantics across any agreed pagination. Changes to selection and asynchronous responses must not mix result sets or disclose other organisers. Unit and browser tests use resolved search rules and distinct creation times; equal-time tie behavior is an implementation decision.