# My Polls — Acceptance Use Cases and User Stories

## Purpose

This supplement translates [My polls requirements](user-requirements-my-polls.md) into observable acceptance scenarios. It complements the existing [acceptance use cases](acceptance-use-cases.md); existing poll creation, publication, collaboration, closing, reopening, and authorization scenarios continue to apply.

These scenarios describe required behaviour, not functionality already implemented. They avoid prescribing routes, selectors, API contracts, or storage details.

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

| Stories | S-043 reusable foundation | Subsequent endpoint/browser verification |
|---|---|---|
| MP-US-01 | Active query default; documented states | Landing page, Create poll, loading/error UI |
| MP-US-02 | Reject claimed owner fields; owner-scoped pure predicate | Verified identity, cross-owner list/cursor/open denial |
| MP-US-03 | Strict safe summary; date preservation; zero dates/count | Desktop table/mobile cards and date display |
| MP-US-04 | Creation comparator; mutation creation-time invariant | Global index order across pages |
| MP-US-05 | Active = Draft + Open; all lifecycle predicates | Filter controls and query reset |
| MP-US-06 | NFC/whitespace/case substring rules; bounded query/cursor schema | Search retention, continuation and empty states |
| MP-US-07–09 | Existing lifecycle contracts retained | Creation, editor/management links and publication navigation |
| MP-US-10 | Existing close/reopen semantics and immutable createdAt tested | Refreshed list membership after transitions |
| MP-US-11 | Public contracts/error codes unchanged | Direct public access and dashboard denial |

Contract and domain cases run in `test/foundation/my-polls-contracts.test.mjs` and `test/foundation/my-polls-query.test.mjs`; creation invariants run in `test/foundation/my-polls-creation.test.mjs`. Authentication, signed cursor verification, persistence, and browser UI are not delivered by S-043.

Shared ownership, ownership transfer, site-wide administration, archiving, duplication, reminders, and bulk actions are outside this supplement's initial scope.
