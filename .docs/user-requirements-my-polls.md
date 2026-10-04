# My Polls — Organiser Dashboard Requirements

## 1. Purpose and Scope

My polls is the normal organiser landing page for Invite-a-Gent. It allows an organiser to find their existing polls, resume work, and create another poll without needing to retain individual poll links.

This document records the resolved dashboard requirements and implemented local behaviour as of 4 October 2026. It supplements the existing [user requirements](user-requirements.md). The owned-list API, responsive browser dashboard, discovery controls and lifecycle return flows are implemented through S-043–S-048. [Acceptance scenarios and MP-US-01–11 evidence](acceptance-use-cases-my-polls.md#story-traceability-and-delivery-boundaries) distinguish pure-rule, component, real local API/database and browser coverage. This is not a production release or deployed sign-in claim.

## 2. Ownership and Access

- The dashboard lists only polls owned by the current organiser.
- It is an organiser dashboard, not a site-wide administrator view.
- Opening a poll from the dashboard uses the existing organiser access checks.
- Public participant links continue to open the relevant poll directly.

The current local application uses a simulated organiser identity and enforces ownership on the server. Missing/invalid identity returns an authentication failure; opening another organiser's poll is forbidden. Production ownership must follow the authenticated organiser identity described in the existing application requirements. Lambda adapter factories consume the verified authorizer subject, but Cognito sign-in and production authorizer configuration have not been delivered or verified.

## 3. Page Layout

- The page is titled **My polls**.
- A prominent **Create poll** action appears above the list.
- Desktop uses a compact table.
- Mobile uses cards showing the same poll information.
- Title search and lifecycle filters are available above the list.

Each poll entry shows:

- Title, linking to the existing poll editor or management view.
- Status: **Draft**, **Open**, or **Closed**.
- Creation date.
- Proposed dates.
- Participant count.

## 4. Sorting, Filters, and Search

- Polls are ordered by creation date, with the most recently created first.
- **Active** is selected by default and includes drafts and open polls.
- Separate **Draft**, **Open**, and **Closed** filters are available.
- Closed polls appear only when the organiser selects **Closed**.
- Title search is included from the outset and applies within the selected filter.
- Reopening a poll returns it to the Active and Open lists. Its original creation date remains unchanged and continues to determine its position.

Active is a dashboard grouping, not an additional poll lifecycle state.

## 5. Navigation and Poll Lifecycle

The dashboard supports the existing flow: create, draft, publish, collaborate, close, and reopen.

- Entering the organiser experience normally opens My polls.
- **Create poll** opens the existing creation flow.
- Selecting a draft opens its existing editor.
- Selecting an open or closed poll opens its existing organiser management view.
- Publishing keeps the organiser on the poll's management page so they can share its link and continue managing it.
- An obvious **My polls** link provides a route back from the editor and organiser management views.
- Closing and reopening remain part of the existing poll management flow.

## 6. Resolved Dashboard Decisions (S-043)

### Search

Title search uses a contiguous substring of the title after applying Unicode NFC normalization, trimming leading/trailing whitespace, collapsing each run of Unicode whitespace to one space, and locale-independent lowercase conversion to both title and search. An exact title therefore matches. Blank/whitespace-only search matches all titles in the selected filter. Accents and punctuation remain significant; there is no fuzzy matching, accent stripping, or search of descriptions, dates, participants, or other organisers. Raw search is limited to 200 Unicode code points. Search text is retained across filter changes.

### Dates and counts

Creation is an immutable UTC instant; show its calendar date in the poll's IANA time zone using the existing en-GB date style with a year (for example `4 Oct 2026`). Ordering uses the instant, not the displayed calendar date. Proposed choices retain their saved order: date-only choices show a calendar date with no invented time or zone conversion; timed choices show the saved local date and time, the poll time zone, and saved UTC offset so repeated DST times remain distinguishable. Include the year. All choices are available in each entry; a wrapping list or accessible disclosure may keep entries compact without dropping choices. An incomplete draft with zero dates shows **No dates proposed**. Participant count is the number of current participant rows, including rows without responses; zero is shown as **0 participants**.

### Pagination

Pagination is required: initially request 25 matching summaries, with an API maximum of 50. **Load more** appends the next page in creation order; there are no numbered pages or total-result count. Search/filter changes discard the accumulated pages and restart at the beginning. A bounded database search can return fewer matches (including zero) with a continuation; keep Load more available and do not declare a terminal no-match state until continuation is exhausted. Creation-order and ownership/search/filter rules apply across all database pages. A refresh restarts from the newest entries; pages are a live list rather than a snapshot.

### States and copy

| State | Copy and action |
|---|---|
| Initial load | **Loading your polls…**, exposed as a status |
| Loading another page | **Loading more polls…**; prevent duplicate loads |
| Exhausted list, blank search | **No active polls yet.**, **No draft polls yet.**, **No open polls yet.**, or **No closed polls yet.**, according to the filter; Create poll remains available |
| Exhausted list, nonblank search | **No polls match your search.** and **Clear search**; filters remain usable |
| Empty page with continuation | **More polls may match.** and **Load more** |
| Initial request failed | **We couldn't load your polls.** and **Try again**; retain search/filter |
| Subsequent request failed | **We couldn't load more polls.** and **Try again**; retain loaded entries and retry the same continuation |
| Authentication required | **Sign in to view your polls.**; use the existing organiser authentication boundary |

Errors never masquerade as an empty successful list. Do not show another organiser's data or a stale response from an earlier query. Dashboard reads do not mutate polls or append audit events.

### Implementation decisions, not additional acceptance requirements

Equal creation instants use descending ordinal poll ID as a deterministic tie-breaker, matching the existing creation index. Returning through My polls from a poll opened in the dashboard restores that tab's filter/search but refreshes from page one; a fresh entry or return after creating a new poll uses Active with blank search. No cross-session state persistence is required. This does not alter the default Active requirement.

## 7. Scope Boundaries

The agreed initial scope includes the owned-poll list, desktop table and mobile cards, creation-date ordering, lifecycle filters, title search, creation entry point, and navigation into and back from existing poll views.

Shared ownership, ownership transfer, site-wide administration, archiving, duplication, reminders, and bulk actions are not part of the agreed initial scope.

The decisions above resolve the initial presentation, search, pagination, and state-copy details. The API, storage and production handoff are defined in [architecture](architecture.md#56-my-polls-contract-and-storage-implementation-s-043--s-044), with current browser routing and freshness in [section 5.7](architecture.md#57-my-polls-browser-routes-freshness-and-identity-boundaries). S-043 supplies contracts/helpers; S-044 supplies the owned-list endpoint and persistence; S-045–S-048 supply navigation, summaries, discovery and lifecycle refresh.

## 8. Implemented Freshness and Delivery Limits

The desktop table and mobile cards show the same five summary fields. All proposed dates are rendered in saved order in a wrapping list, including timed offsets and years; incomplete drafts show the resolved zero-date/count copy. Filters and labelled title search request the server's owned list, initially 25 summaries. Load more appends server-ordered entries and deduplicates poll IDs. Keyboard operation and narrow layouts have component and local browser coverage.

Successful create/save/publish/close/reopen responses invalidate loaded dashboard pages and pending responses. Returning through My polls requests page one with caching disabled. Existing-poll returns retain filter/search; new creation returns use Active and blank search. This refresh also obtains current participant counts after public collaboration. A dashboard restored through a persisted `pageshow` refetches page one; component tests dispatch restoration events explicitly and do not prove native browser back/forward-cache restoration.

Query or URL identity changes discard loaded pages and prevent earlier success/error bodies from replacing current results. An authentication failure clears summaries and continuation. The local browser derives its simulated identity from `testRunId` (default `browser`); there is no sign-in or identity-switch control. The dashboard does not subscribe to focus, visibility or timer refresh. Summary freshness is established on reads and returns, not by live push updates. Creation-index propagation is eventually consistent, so a just-created poll may need another fresh read in an AWS environment; pagination is a live list, not a snapshot.

Existing final-date confirmation, one-revision atomic close, confirmed reopen with provisional selection, closed participant/date restrictions, location maintenance and server authorization remain unchanged. Management opened by poll ID shows responses read-only; participant editing uses the existing public capability. Summaries and owned detail reads do not disclose a share capability. Publication retains its issued share link in the current management document; recovering that link from a later dashboard visit is not delivered.

Production stacks, deployable handler composition, Cognito browser sign-in, index/IAM synthesis, deployed migration and live AWS smoke verification remain pending. The [S-044 verification record](s044-verification.md) is historical backend evidence, not a statement that later browser work is still outstanding. Smoke integration, README operational guidance and the final acceptance/regression run are separate T-125–T-127 deliverables; this documentation update does not claim them complete.
