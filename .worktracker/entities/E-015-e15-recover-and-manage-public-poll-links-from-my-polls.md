---
id: E-015
type: epic
title: "E15 — Recover and manage public poll links from My polls"
parent: null
dependsOn: [E-014]
estimate: 21
tags: [my-polls, planning, public-links, security]
archived: false
created: 2026-10-10T13:45:55.528Z
updated: 2026-10-10T13:46:13.781Z
---
## Outcome

Allow an organiser to return to the public URL for an already-published poll from My polls, while preserving the existing unguessable bearer-link model and keeping public-link secrets out of list responses.

## Recommended UX

- Add a Share link action to every Open and Closed poll in My polls; Draft polls do not expose it.
- Render the action in the desktop summary table and the equivalent mobile poll card.
- Open a reusable owner-only share panel/dialog containing the public poll URL, Copy link, and Open poll actions.
- Reuse the existing post-publication share experience so publication and later retrieval have one consistent interaction.
- Keep URL loading on demand with loading, recoverable error, and copy-success states.
- Offer Regenerate link… only as an explicit, confirmed action; explain that the previous URL will stop working immediately.
- For legacy polls whose original token cannot be recovered, clearly offer one-time link generation with the same replacement warning.
- Do not expose share actions for drafts or leak public URLs into the My polls list response.

## Backend design

- Continue storing the token hash for public-link validation.
- For newly published polls, persist an application-encrypted copy of the bearer token so an authenticated owner can recover the original URL without rotating it.
- Add an owner-scoped GET endpoint for the share URL, returning only the constructed publicUrl after server-side ownership verification.
- Do not return publicToken, encrypted token material, or publicUrl from list summaries or unauthenticated/public responses.
- Add an owner-scoped rotation endpoint that atomically creates a new token, replaces the hash and encrypted token, revokes the prior capability, and records an audit event.
- Use no-store response/cache behavior and avoid logging bearer URLs.
- Define a safe legacy path for polls created before recoverable-token storage: return a non-sensitive, actionable state and require explicit confirmation before generating a replacement link.
- Preserve server-side ownership enforcement and revoked-link behavior in local and production adapters.

## Completion boundary

Planning only for this epic. Implementation work must be tracked by the child stories/tasks and remains todo until explicitly started. Completion requires UI, service/repository, contracts, security, legacy behavior, and regression/acceptance coverage.