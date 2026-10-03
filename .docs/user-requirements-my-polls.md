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

## 6. Scope Boundaries and Remaining Details

The agreed initial scope includes the owned-poll list, desktop table and mobile cards, creation-date ordering, lifecycle filters, title search, creation entry point, and navigation into and back from existing poll views.

Shared ownership, ownership transfer, site-wide administration, archiving, duplication, reminders, and bulk actions are not part of the agreed initial scope.

Exact presentation of proposed dates, search matching rules, pagination, and empty/loading/error-state copy remain to be specified. These details do not change the agreed ownership, navigation, filtering, or sorting behaviour.
