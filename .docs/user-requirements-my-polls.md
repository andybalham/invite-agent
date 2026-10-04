# My Polls — Organiser Dashboard Requirements

## 1. Purpose and Scope

My polls is the normal organiser landing page for Invite-a-Gent. It allows an organiser to find their existing polls, resume work, and create another poll without needing to retain individual poll links.

This document records the agreed dashboard design. It supplements the existing [user requirements](user-requirements.md) and describes intended behaviour, rather than functionality already implemented.

## 2. Ownership and Access

- The dashboard lists only polls owned by the current organiser.
- It is an organiser dashboard, not a site-wide administrator view.
- Opening a poll from the dashboard uses the existing organiser access checks.
- Public participant links continue to open the relevant poll directly.

The current local application uses a simulated organiser identity. The dashboard must respect that identity in local development; production ownership follows the authenticated organiser identity described in the existing application requirements.

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

The decisions above resolve the initial presentation, search, pagination, and state-copy details. The API and storage handoff is defined in [architecture](architecture.md). S-043 implements reusable contracts/helpers only; the dashboard and owned-list endpoint are subsequent stories.
