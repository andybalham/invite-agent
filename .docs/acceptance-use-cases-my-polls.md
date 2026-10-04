# My Polls — Acceptance Use Cases and User Stories

## Purpose

This supplement translates [My polls requirements](user-requirements-my-polls.md) into observable acceptance scenarios. It complements the existing [acceptance use cases](acceptance-use-cases.md); existing poll creation, publication, collaboration, closing, reopening, and authorization scenarios continue to apply.

These scenarios describe required behaviour. S-043–S-048 implement the local dashboard and owned-list API; the traceability below maps MP-US-01–11 to executable coverage. Scenario wording avoids prescribing routes, selectors, API contracts or storage details; implementation notes describe the current code and its limits. Coverage references are not a claim that these suites were rerun for this documentation update or that production Cognito/AWS behavior was verified.

## Test conventions

- Follow the existing acceptance document's test conventions, including separate browser contexts and server-side authorization checks.
- Use identifiers prefixed with `MP` so these use cases and stories remain distinct from the existing document.
- Create isolated data for two organisers, each owning polls. The local simulated identity represents the authenticated organiser in local tests; these scenarios do not verify production sign-in.
- Give test polls distinct creation times so newest-first ordering can be asserted without defining a tie-breaking rule.
- Include Draft, Open, and Closed polls, known proposed dates, and known participant counts.
- Dashboard navigation, filtering, and search are read-only and must not create poll mutations or audit revisions. For lifecycle mutations, retain the existing audit assertions.
- Assert semantic content and behaviour and the state copy resolved in the requirements; date assertions distinguish calendar dates from times and include the poll time zone where applicable.

## Use case MP-UC-01: Enter My polls and review owned polls

**Primary actor:** Organiser  
**Goal:** Find existing polls from the normal organiser landing page.  
**Success outcome:** The organiser sees their active polls, newest-created first, with enough information to choose a poll.

### MP-US-01 — Use My polls as the organiser landing page

**As an organiser, I want My polls to be my landing page so that I can resume work or create another poll.**

```gherkin
Given I have an organiser identity
And I own draft, open, and closed polls
When I enter the normal organiser experience
Then I see the My polls page
And Active is the selected filter
And my draft and open polls are listed
And my closed polls are not listed
And a prominent Create poll action is available above the list
```

### MP-US-02 — Show only the current organiser's polls

**As an organiser, I want my dashboard restricted to my polls so that other organisers' information remains private.**

```gherkin
Given organiser Olivia and organiser Owen each own draft, open, and closed polls
When Olivia views each My polls filter
Then only Olivia's polls are returned and displayed
And Owen's poll titles and summaries are not disclosed

Given I do not have an organiser identity
When I request the organiser poll list directly
Then organiser authentication is required
And no organiser poll summaries are returned

Given I am authenticated as Olivia
When I attempt to open Owen's poll through the organiser interface or API
Then access is denied by the server
And I cannot manage Owen's poll
```

### MP-US-03 — Show useful poll summaries on desktop and mobile

**As an organiser, I want consistent summaries across devices so that I can identify the poll I need.**

```gherkin
Given I own polls with known titles, statuses, creation dates, proposed dates, and participant counts
When I view My polls on a desktop viewport
Then the polls appear in a compact table
And each entry shows its title, lifecycle status, creation date, proposed dates, and participant count
And each title provides a link to that poll

When I view My polls on a mobile viewport
Then the polls appear as cards
And each card provides the same summary information and poll link
And title search, lifecycle filters, and Create poll remain available
```

### MP-US-04 — Order by creation date rather than recent activity

**As an organiser, I want newly created polls first so that the list has a predictable order.**

```gherkin
Given I own several active polls with distinct creation times
When I view My polls
Then the polls appear from most recently created to oldest

When I edit an older poll and return to My polls
Then it retains its original creation date
And its position is still determined by creation date
```

## Use case MP-UC-02: Find polls by lifecycle and title

**Primary actor:** Organiser  
**Goal:** Narrow the list to relevant polls.  
**Success outcome:** Filters and title search work together without changing poll state or creation-date ordering.

### MP-US-05 — Filter by lifecycle

**As an organiser, I want lifecycle filters so that I can separate current work from closed polls.**

```gherkin
Scenario Outline: Show the selected lifecycle group
  Given I own draft, open, and closed polls
  And title search is empty
  When I select the <filter> filter
  Then only my polls in <included states> are listed
  And they are ordered by creation date with newest first

  Examples:
    | filter | included states |
    | Active | Draft and Open  |
    | Draft  | Draft           |
    | Open   | Open            |
    | Closed | Closed          |
```

### MP-US-06 — Search poll titles within the selected filter

**As an organiser, I want title search immediately available so that I can find a named poll.**

```gherkin
Given I own draft, open, and closed polls titled Autumn get-together
And I own an open poll titled Winter dinner
And another organiser owns an open poll titled Autumn get-together
When I select Active and search for Autumn get-together
Then only my matching draft and open polls are listed
And they remain ordered by creation date with newest first

When I select Closed while retaining that search
Then only my matching closed poll is listed

When I clear the search
Then all my polls in the selected filter are listed

When I search for a title that none of my polls has
Then no poll entries are shown
And I can change or clear the search
```

Exact-title matching remains required. The following decisions extend matching without replacing it:

```gherkin
Given I own an open poll titled Café Autumn dinner
When I search for a decomposed-Unicode spelling of CAFÉ followed by extra whitespace and Autumn
Then that poll is listed
When I search for cafe
Then that poll is not listed because accents remain significant
When I search for Autumn
Then that poll is listed by partial title match
When I search using only whitespace
Then all my polls in the selected filter are listed
```

## Use case MP-UC-03: Create and manage polls from the dashboard

**Primary actor:** Organiser  
**Goal:** Move between My polls and existing poll workflows.  
**Success outcome:** The dashboard provides access to existing workflows and a clear return path.

### MP-US-07 — Create a poll and return to My polls

**As an organiser, I want to start a new poll from My polls so that creation is easy to discover.**

```gherkin
Given I am viewing My polls
When I select Create poll
Then the existing poll creation flow opens

When I save a valid new draft
And I use the visible My polls link to return
Then the new draft appears in the default Active list
And it is ordered by its creation date
And its saved summary information is shown
```

### MP-US-08 — Open existing polls and navigate back

**As an organiser, I want poll titles to open the appropriate existing view so that I can continue managing them.**

```gherkin
Scenario Outline: Open a poll from My polls
  Given I own a poll in the <state> state
  And I am viewing a filter that includes it
  When I select its title
  Then its existing <view> opens
  And an obvious My polls link is available

  When I select My polls
  Then I return to the dashboard

  Examples:
    | state  | view                      |
    | Draft  | poll editor               |
    | Open   | organiser management view |
    | Closed | organiser management view |
```

### MP-US-09 — Stay on the poll after publication

**As an organiser, I want to remain on the published poll so that I can share its link and continue managing it.**

```gherkin
Given I have opened a valid draft from My polls
When I publish it successfully
Then I remain on that poll's organiser management page
And its shareable link is available
And an obvious My polls link is available

When I return to My polls and select Open
Then the published poll is listed with Open status
And its original creation date is unchanged
```

### MP-US-10 — Reflect closing and reopening in the list

**As an organiser, I want lifecycle changes reflected in My polls so that active work and closed polls remain separated.**

```gherkin
Given I own an open poll
When I close it through the existing poll management flow
And I return to My polls
Then it is absent from Active and Open
And it appears under Closed with Closed status
And its original creation date is unchanged

When I open it from Closed and reopen it through the existing management flow
And I return to My polls
Then it appears under Active and Open with Open status
And it is absent from Closed
And it retains its original creation date
And its position follows creation-date ordering rather than reopening time
```

### MP-US-11 — Preserve direct participant access

**As a link holder, I want the public link to open its poll directly so that organiser navigation does not interrupt participation.**

```gherkin
Given an organiser has published a poll
When an unauthenticated link holder opens its current public link
Then the public poll opens directly
And the link holder is not redirected to My polls
And the existing participant permissions and lifecycle restrictions apply
And the public link does not grant access to the organiser poll list
```

## Resolved decision acceptance cases (S-043)

### MP-US-03: Date representations and incomplete drafts

```gherkin
Given I own an incomplete draft with no proposed dates and no participants
When I view its dashboard summary
Then I see No dates proposed and 0 participants

Given I own a poll with a date-only choice and a timed choice during a repeated DST hour
When I view its summary from a browser in another time zone
Then the date-only choice keeps its saved calendar date and has no invented time
And the timed choice keeps its saved local date and time
And the poll time zone and chosen UTC offset distinguish the timed choice
And creation is displayed as a date in the poll time zone
And all displayed dates include the year
```

### MP-US-04–06: Pagination and query changes

```gherkin
Given I own more matching polls than fit on the first page
And another organiser also owns matching polls
When I load My polls and select Load more
Then matching owned polls from subsequent database pages are appended newest-created first
And no other organiser's summaries are returned
When I change the filter
Then my search text is retained and paging restarts
When I change the search
Then the old pages are replaced with the new query's results

Given a bounded search page contains no matches but has a continuation
Then I see More polls may match. and Load more
And I do not yet see No polls match your search.
```

### MP-US-01, MP-US-06: Loading, empty, and failure states

```gherkin
When my first request is pending
Then I see Loading your polls… as a status
When it succeeds with an exhausted empty Active list and blank search
Then I see No active polls yet. and Create poll remains available
When an exhausted search has no matches
Then I see No polls match your search. and Clear search
When the initial request fails
Then I see We couldn't load your polls. and Try again
And search and filter choices are retained
When loading another page fails
Then I see We couldn't load more polls. and Try again
And previously loaded entries remain visible
```

Use the corresponding Draft/Open/Closed empty-state copy from the requirements. These decisions do not introduce recovery from stale poll links. Equal-time ordering and return-state restoration remain documented implementation decisions, not new acceptance requirements.

## Story traceability and delivery boundaries

Paths below refer to actual test files. Component suites render the real TypeScript frontend with intercepted API replies. Integration suites use real HTTP/DynamoDB Local, except the explicitly stubbed Lambda authorizer context. E2E suites use the real local stack. Pure helpers alone are not authorization or browser evidence.

| Story | Foundation / domain / contract | Server / persistence | Component / local browser |
|---|---|---|---|
| MP-US-01 landing | [query defaults](../test/foundation/my-polls-query.test.mjs), [request schema](../test/foundation/my-polls-contracts.test.mjs) | [API defaults/authentication](../test/integration/my-polls-api.test.mjs) | [entry/Create](../test/component/organiser-navigation.test.mjs), [loading/retry/empty](../test/component/my-polls-loading.test.mjs), [real landing](../test/e2e/organiser-navigation.spec.ts) |
| MP-US-02 ownership | [owner predicates](../test/foundation/my-polls-query.test.mjs), [cursor boundaries](../test/foundation/my-polls-cursor.test.mjs), [stale-index rechecks](../test/foundation/my-polls-persistence.test.mjs) | [two-owner queries](../test/integration/my-polls-repository.test.mjs), [no-auth/forged owner/foreign cursor/per-poll denial](../test/integration/my-polls-api.test.mjs) | [identity/query races](../test/component/my-polls-search.test.mjs), [real detail guards](../test/e2e/navigation-guards.spec.ts), [discovery access matrix](../test/e2e/my-polls-search.spec.ts) |
| MP-US-03 summaries | [safe fields/date projection](../test/foundation/my-polls-query.test.mjs), [summary schema](../test/foundation/my-polls-contracts.test.mjs) | [saved dates/counts](../test/integration/my-polls-repository.test.mjs), [current lifecycle counts](../test/integration/my-polls-lifecycle.test.mjs) | [table/cards, DST/viewer zones, incomplete drafts/narrow widths](../test/component/my-polls-summary.test.mjs), [real desktop/mobile summaries](../test/e2e/my-polls-lifecycle.spec.ts) |
| MP-US-04 creation order | [comparator/tie-break](../test/foundation/my-polls-query.test.mjs), [immutable creation](../test/foundation/my-polls-creation.test.mjs), [lifecycle invariants](../test/foundation/my-polls-lifecycle.test.mjs) | [global page order](../test/integration/my-polls-repository.test.mjs), [mutation invariants](../test/integration/my-polls-lifecycle.test.mjs) | [append/deduplicate](../test/component/my-polls-search.test.mjs), [all-page matrix/older edit](../test/e2e/my-polls-search.spec.ts), [reopen order](../test/e2e/my-polls-lifecycle.spec.ts) |
| MP-US-05 lifecycle filters | [Active/lifecycle predicates](../test/foundation/my-polls-query.test.mjs) | [every filter/owner](../test/integration/my-polls-repository.test.mjs), [API matrix](../test/integration/my-polls-api.test.mjs) | [controls/reset](../test/component/my-polls-search.test.mjs), [real desktop/mobile keyboard matrix](../test/e2e/my-polls-search.spec.ts) |
| MP-US-06 title search | [normalization/explicit discovery answers](../test/foundation/my-polls-query.test.mjs), [query limits](../test/foundation/my-polls-contracts.test.mjs) | [matching/sparse pages/budget](../test/integration/my-polls-repository.test.mjs), [raw-query validation/cursor binding](../test/integration/my-polls-api.test.mjs) | [retain/clear/races/no-match](../test/component/my-polls-search.test.mjs), [retry/continuations](../test/component/my-polls-loading.test.mjs), [real search/sparse pages](../test/e2e/my-polls-search.spec.ts) |
| MP-US-07 creation | [saved-summary invariant](../test/foundation/my-polls-lifecycle.test.mjs) | [create/edit summaries/revisions](../test/integration/my-polls-lifecycle.test.mjs) | [Create from Active/Closed](../test/component/organiser-navigation.test.mjs), [fresh default return](../test/component/my-polls-lifecycle.test.mjs), [UI-created polls on both viewports](../test/e2e/my-polls-lifecycle.spec.ts) |
| MP-US-08 title/return | [summary lifecycle schema](../test/foundation/my-polls-contracts.test.mjs) | [owned detail access](../test/integration/my-polls-api.test.mjs) | [Draft/Open/Closed destinations/return links](../test/component/organiser-navigation.test.mjs), [real direct routes](../test/e2e/organiser-navigation.spec.ts), [page-two retained query](../test/e2e/my-polls-search.spec.ts), [both lifecycle layouts](../test/e2e/my-polls-lifecycle.spec.ts) |
| MP-US-09 publication | [creation invariant](../test/foundation/my-polls-lifecycle.test.mjs) | [Open membership/audit](../test/integration/my-polls-lifecycle.test.mjs) | [stay on management/share](../test/component/organiser-navigation.test.mjs), [return membership](../test/component/my-polls-lifecycle.test.mjs), [real publication](../test/e2e/my-polls-lifecycle.spec.ts) |
| MP-US-10 close/reopen | [confirmed transitions/creation invariants](../test/foundation/my-polls-lifecycle.test.mjs) | [membership/counts/atomic close/reopen/rejected writes](../test/integration/my-polls-lifecycle.test.mjs) | [return refresh/simulated restoration](../test/component/my-polls-lifecycle.test.mjs), [real confirmations/frozen results/provisional selection](../test/e2e/my-polls-lifecycle.spec.ts) |
| MP-US-11 public isolation | Existing public contracts retained; [cursor owner validation](../test/foundation/my-polls-cursor.test.mjs) does not grant public-list access | [capability/no-auth denial/public Lambda scope](../test/integration/my-polls-api.test.mjs), [capability lifecycle denial](../test/integration/my-polls-lifecycle.test.mjs) | [public precedence/no interception](../test/component/organiser-navigation.test.mjs), [separate link-holder context in Open/Closed/reopened states](../test/e2e/my-polls-lifecycle.spec.ts), [direct public guards](../test/e2e/navigation-guards.spec.ts) |

Across these stories, [repository](../test/integration/my-polls-repository.test.mjs), [discovery browser](../test/e2e/my-polls-search.spec.ts) and [lifecycle browser](../test/e2e/my-polls-lifecycle.spec.ts) cases compare complete paginated application/audit snapshots around reads. Lifecycle cases retain existing mutation audit/version assertions. [Fixture isolation](../test/integration/my-polls-fixture.test.mjs) and [failure-path teardown](../test/integration/integration-cleanup.test.mjs) cover disposable integration tables.

Resolved loading/error/date/continuation decisions are covered by the referenced component suites and server tests. Native back/forward-cache acceptance, Cognito sign-in, production deployment/index migration and live AWS smoke checks are not established by these tests. The browser has no sign-in control, automatic dashboard polling or inline close/reopen actions. Link recovery on a later owned-detail visit is not delivered. T-125–T-127 own README guidance, smoke integration and final regression evidence; they are not completed by T-124.

Shared ownership, ownership transfer, site-wide administration, archiving, duplication, reminders, and bulk actions are outside this supplement's initial scope.

### S-044 API and persistence evidence

| Acceptance | Executable evidence |
|---|---|
| MP-US-02, 11 | `test/integration/my-polls-api.test.mjs`: actual local HTTP identity failures, forged-owner rejection, signed cross-owner cursor denial, per-poll 403, public access retained, public Lambda rejects organiser paths |
| MP-US-03–06 | `test/integration/my-polls-repository.test.mjs`: both organisers, every lifecycle filter, normalized title search, safe dates/counts, sparse pages and 200-candidate continuation budget, complete creation ordering without omission/duplication |
| MP-US-04, 10 | Repository lifecycle case verifies creation time/order and close/reopen membership; transactional participant add/delete/undo counts and explicit legacy migration are covered |
| Read-only access | Repository and HTTP cases compare complete application/audit table snapshots before and after list/filter/search requests; missing legacy counts fail without repairs |
| Isolation | `my-polls-fixture.test.mjs` and `integration-cleanup.test.mjs` prove separate table pairs and teardown after a forced dashboard assertion failure |
| Production boundary | `my-polls-api.test.mjs` compares local and HTTP API v2 adapter contracts with authorizer stubs; `my-polls-cursor.test.mjs` covers cryptographic canonicalization/expiry/key validation; production import-boundary checks exclude local adapters |

This S-044 evidence describes the backend delivery stage. Desktop/mobile presentation, navigation and refresh are now implemented by S-045–S-048 and mapped above. Real Cognito/AWS verification remains outstanding. E-008 route, index, IAM and migration enablement requirements are recorded in architecture section 5.6.

### S-045 navigation test contract (T-108)

`test/component/organiser-navigation.test.mjs` specifies MP-US-01, MP-US-07–09 and MP-US-11 with isolated browser component tests of the real TypeScript entry. Run `npm run test:component` (or `node --test test/component/organiser-navigation.test.mjs`). T-108 supplied the acceptance contracts; T-109 implements My polls landing, creation entry, title destinations, return links and publication-to-management behavior. Direct-link and authorization cases guard existing behavior. Additional component assertions cover creation from Closed returning to default Active and the issued share link remaining visible after management refresh. Clicks use the harness's 10-second navigation budget; UI assertions retain their 1.5-second timeout.

`test/support/frontend-component-harness.mjs` builds the application in memory using Vite and intercepts every request. `test/support/organiser-navigation-fixture.mjs` supplies controlled Draft/Open/Closed summaries, organiser detail/history responses, public capability responses, draft saves and publication. No dev stack, live API, DynamoDB, or external font download is used. A Playwright Chromium installation is required; on Windows the harness uses installed Edge when bundled Chromium is absent. Set `COMPONENT_BROWSER_CHANNEL` to choose an installed Playwright browser channel explicitly. These tests run separately from the browser-free foundation suite.

Direct organiser routes retain the existing `/?pollId=…&testRunId=…`, `view=history`, and `/p/<token>?organiser=1&testRunId=…` forms. Plain `/p/<token>` capabilities, including conflicting `pollId`/`view` parameters, open public views without organiser/list requests or simulated credentials. Normal entry without `testRunId` retains `local-organiser-browser`; explicit empty `testRunId=` yields the invalid `local-organiser-` identity and the existing unauthenticated boundary. S-045 identity-change cases navigate to a new URL with another `testRunId`; they do not define a sign-in flow or identity-switch control. Later dashboard component suites cover same-document URL changes and rejection of responses from previous queries/identities, including delayed success/error bodies.

### S-047 browser filter/search evidence (T-118)

`test/e2e/my-polls-search.spec.ts` verifies MP-US-04–06 against the real local API and DynamoDB on desktop (1280 × 900) and mobile (390 × 844), building on T-116/T-117. Fresh identities and sequential API creates provide two owners and distinct persisted creation instants. Assertions compare poll IDs as well as titles/statuses, covering the same title in Draft/Open/Closed, another owner's matching title, every lifecycle filter, Active default, Closed exclusion, search retention/clearing, no-match recovery and the resolved NFC/case/Unicode-whitespace/substring rules with significant accents and punctuation. Non-title fields and another owner's exclusive title cannot match.

The pagination cases place 26 older matching Open polls behind 201 newer nonmatching drafts, forcing the repository's 200-candidate continuation and an empty API page before matching pages of 25 and 1. They verify Load more, creation order without omissions/duplicates, query resets after accumulated pages, Closed exclusion, and returning from a page-two poll with retained filter/search and refreshed page-one results.

Before and after discovery, complete poll and audit partitions are read with consistent, paginated database queries for both owners, including metadata and creation-index keys. Browser API requests must be GETs with no bodies. The intentional older-draft edit is verified separately as exactly one PUT and one audit revision; its stored `createdAt`, creation-index key and final list position remain unchanged, and subsequent return navigation preserves the post-edit snapshot.

With the local dev stack running, execute `node node_modules/@playwright/test/cli.js test test/e2e/my-polls-search.spec.ts --project=chromium --workers=1 --retries=0`. The database reader uses the same `DYNAMODB_ENDPOINT`/`DYNAMODB_PORT`, `APP_TABLE_NAME` and `AUDIT_TABLE_NAME` defaults as the local stack; pass matching values to the test process when running a custom stack. These cases use simulated local identities and do not claim production Cognito/AWS verification.

### S-047 combined discovery verification (T-119)

With the local stack running, `npm run test:discovery` builds and runs the focused pure-rule/contract, frontend component, API/repository and desktop/mobile browser suites in sequence. It stops on the first failed stage, uses one Chromium worker with zero retries, inherits the stack's endpoint/table/port environment, and does not start or stop services. Integration fixtures clean up their own disposable table pairs; browser setup creates polls under fresh organiser identities in the configured local application tables, following T-118's fixture convention.

`test/support/my-polls-discovery-cases.mjs` supplies explicit acceptance answers for every filter combined with blank, exact, case, NFC/Unicode-whitespace, substring, punctuation, accent/punctuation mismatch, literal regex text, non-title fields, foreign-title and no-match searches. Expected title membership comes from those answers rather than the production normalizer. Pure rules, actual HTTP/Lambda adapters and the real UI consume the same decisions.

| Requirement or decision | Focused evidence |
|---|---|
| MP-US-04: global creation ordering | The browser matrix seeds 26 same-title polls plus a distinct title in each lifecycle. Every successful query is exhausted and compares each API page and accumulated desktop table/mobile cards by ID, title, status and immutable creation instant; no duplicates or omissions are allowed. Active crosses three matching pages, each individual lifecycle two. Existing T-118 sparse cases retain the empty continuation followed by 25 + 1 matches behind 201 distractions. |
| MP-US-05: lifecycle membership | Explicit Active = Draft + Open answers and separate Draft/Open/Closed answers are compared with pure-rule selection and live results for every search case. Selected controls expose the correct pressed state. |
| MP-US-06: resolved title matching | The same title in every lifecycle distinguishes title search from lifecycle filtering. Significant accents/punctuation, NFC/case/Unicode whitespace, literal substrings, blank search and excluded non-title fields have explicit expected answers on both viewports. |
| Query access boundary | API cases cover both owners, every filter/search decision, every available continuation, missing/invalid local identity, public bearer credentials, claimed-owner rejection and foreign-cursor rejection. Lambda cases verify JWT identity overrides a spoofed local header, missing claims deny access and the public adapter rejects organiser discovery. Browser cases verify foreign first-page IDs, reject foreign/no-auth continuations and display the authentication alert with no rows for every query mode. |
| Accessible controls | Live desktop/mobile tests tab through all lifecycle buttons, verify their results-region relationships and Active description, and activate filters, Clear search and Load more with Enter/Space. Search remains labelled, clearing restores focus, and neither layout overflows horizontally. T-116/T-117 component cases retain search/filter/clear, races, continuation and no-match recovery coverage. |
| Read-only audit/version behavior | API cases compare complete, consistently read and paginated application/audit tables. Browser cases compare complete poll/audit partitions for both owners, including versions and creation-index keys; every observed API request is a bodyless GET. T-118's intentional older-draft edit remains a separate one-PUT/one-revision assertion. |

These tests cover the approved live-list pagination and refresh decisions. They add no stale-link recovery requirement and do not claim production Cognito/AWS verification.

### S-048 lifecycle return refresh (T-120/T-121)

Successful create/save/publish/close/reopen responses invalidate dashboard pages and pending list responses. Existing My polls links navigate to a fresh document and request page one with `cache: "no-store"`. A dashboard restored by browser Back/Forward also refetches page one on persisted `pageshow`; the accompanying `popstate` does not duplicate that read. Same-document identity/query changes still replace pending results. Read-only management returns use the same fresh read so participant counts reflect current state. Dashboard focus, visibility and timer events do not subscribe to updates.

Newly created drafts return to Active with blank search. Existing poll returns retain filter/search and reconcile membership from saved summaries. Publication stays on management with its issued share link; close/reopen keep their confirmation and provisional-selection behavior. Summaries use original creation time and server creation order rather than mutation time.

`test/foundation/my-polls-lifecycle.test.mjs` exercises the real lifecycle service and immutable creation ordering. `test/component/my-polls-lifecycle.test.mjs` exercises the actual save/publication/confirmation/return UI, counts, search/filter membership, desktop/mobile summaries and page-two invalidation. Its T-121 restore cases dispatch browser lifecycle events explicitly because intercepted component requests disable browser caching; they do not claim a native browser-cache acceptance run. `test/component/my-polls-loading.test.mjs` additionally verifies accumulated-page reset and rejection of an old pending continuation after restoration.

Run `npm run build`, then `node --test test/foundation/my-polls-lifecycle.test.mjs test/component/my-polls-lifecycle.test.mjs test/component/my-polls-loading.test.mjs test/component/organiser-navigation.test.mjs` for focused verification. Existing services, public capabilities and audit rules are reused; no inline dashboard close/reopen controls are added.

### S-048 server lifecycle evidence (T-122)

`test/integration/my-polls-lifecycle.test.mjs` drives the local HTTP server and real DynamoDB Local in disposable application/audit table pairs. MP-US-07–10 assertions query every lifecycle filter after each create, edit, publish, participant mutation, close, reopen and undo. Incomplete drafts, saved calendar/DST date choices, current participant counts, immutable creation instants and newest-created ordering are checked against explicit expected summaries, including newer peers and a foreign owner's poll.

Each successful mutation adds exactly one existing audit event and one contiguous poll revision, preserving all prior events. Final-date selection, frozen ranking and closure share one `POLL_CLOSED` revision; reopening adds a separate `POLL_REOPENED` revision and restores participant writes. Participant add/delete/rename/availability and their undo inversions verify persisted counts, metadata status/version and creation-index keys alongside summaries. Repeated paginated list/search/filter requests and undo previews preserve complete, consistently read application/audit snapshots.

Non-owner, unauthenticated and public-capability lifecycle requests are denied without writes. Closed participant add/rename/availability/delete, proposed-date add/edit/reorder/remove and participant undo remain rejected; permitted location maintenance does not unlock responses. Duplicate close/reopen/undo and unconfirmed close/reopen also leave data and summaries unchanged. These cases retain existing authorization and lifecycle acceptance and do not claim production AWS/Cognito verification.

With DynamoDB Local running, execute `npm run build`, then `node --test test/integration/my-polls-lifecycle.test.mjs`. Fixtures honor `DYNAMODB_ENDPOINT` or `DYNAMODB_PORT` and clean up only their own tables.

### S-048 browser lifecycle evidence (T-123)

`test/e2e/my-polls-lifecycle.spec.ts` covers MP-US-07–11 in one complete journey on desktop (1280 × 900) and one on mobile (390 × 844), against the real local API and DynamoDB. Each fresh organiser creates and saves two polls through the UI. The older draft is opened by title, edited, published to management with its share link, closed through the existing final-date confirmation, opened by title from Closed, and reopened through the existing confirmation. Returns and lifecycle filters verify exact membership, original creation dates, saved proposed dates and newest-created order. A newer untouched draft stays ahead of the older poll after edits, collaboration and reopening.

The organiser and an independent unauthenticated link-holder browser context collaborate on participant rows and availability. Dashboard returns show two participants before closure and after reopening, then three after a further public addition. Direct public links are opened in Open, Closed and reopened states, preserving participant controls and provisional selection while exposing no organiser navigation. Organiser listing is denied both without credentials and when the public capability is presented as bearer credentials. Closed add, rename, availability and delete requests are rejected by the server without changing stored data.

Consistent, paginated reads compare complete application and audit partitions around navigation, filtering, public-link visits and cancelled confirmations. Observed navigation API requests are bodyless GETs. Every successful mutation adds exactly its expected existing audit event and contiguous revision, preserving prior events, original `createdAt` and creation-index keys. Publication retains its existing draft-save event followed by `POLL_PUBLISHED`; close and reopen each add one lifecycle event. The newer draft's final partition snapshot is unchanged.

With the local dev stack running, execute `node node_modules/@playwright/test/cli.js test test/e2e/my-polls-lifecycle.spec.ts --project=chromium --workers=1 --retries=0`. The store fixture honors the stack's `DYNAMODB_ENDPOINT`/`DYNAMODB_PORT`, `APP_TABLE_NAME` and `AUDIT_TABLE_NAME`; Playwright honors `WEB_PORT`. Fresh browser identities follow the existing retained local browser-data convention. These cases use local simulated organiser authentication and do not claim production Cognito/AWS verification.
