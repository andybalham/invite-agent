# My Polls usability improvements

**Date:** 11 October 2026  
**Status:** Proposed design  
**Scope:** Organiser dashboard (`My polls`) and organiser poll-management view

## Summary

The current `My polls` page works well for a small number of polls, but becomes difficult to scan when polls contain many proposed dates. Each date is rendered inline in the desktop table and mobile cards, which causes rows and cards to grow unpredictably and pushes the most important information and actions away from the poll title.

The page should be refocused as a discovery and navigation surface. Date details should be progressively disclosed, while public-link management should move to the actual poll-management page, where it is more contextually appropriate.

## Design goals

- Make a long list of polls easy to scan.
- Keep the poll title, lifecycle state, participant count and primary action prominent.
- Preserve access to every proposed date without making every result expand to its full height.
- Make the mobile experience remain compact when a poll has many dates.
- Establish the poll-management page as the canonical place to share and secure a public link.
- Preserve existing ownership, lifecycle, link-rotation and return-navigation rules.
- Maintain keyboard and screen-reader access to all controls and date details.

## Current-state observations

### My polls list

- Desktop results are rendered as a table with title, status, created date, proposed dates and participants.
- Proposed dates are rendered as a wrapping inline list in every row.
- Mobile results are rendered as cards with the same full date list in a definition list.
- Pagination uses `Load more polls`, which is appropriate for the existing cursor-based API, but the interface does not show how many results have been loaded.
- Search updates the query on every input event, which can cause repeated requests and rerenders while the user is typing.
- Share-link panels are attached to individual results, adding more vertical content and state to an already variable-height list.

### Poll-management page

- A share panel already exists for the organiser after publication.
- The panel supports retrieving the current public link, opening the poll as a link holder and rotating the link.
- Link rotation correctly warns that the existing link stops working immediately.
- Organiser-only controls are already separated from the public link-holder experience.

## Proposed `My polls` design

### 1. Use a compact default summary

Each result should prioritise:

- Poll title and link to the poll-management page.
- Lifecycle status.
- Participant count.
- Created date.
- Proposed-date count.
- A primary action such as `Open poll`.

Instead of rendering every date by default, show a compact value such as:

> 12 proposed dates · 4 participants

For closed polls, show the selected date as a separate high-priority value:

> Final date: Saturday, 14 November 2026

### 2. Provide progressive disclosure for dates

Show a short preview of the first two or three dates, followed by a control such as `+9 more dates` or `View all dates`.

The control should expand an accessible region containing the complete saved date list in saved order. It should support `Show dates` / `Hide dates` state, keyboard activation and an appropriate `aria-expanded` relationship.

For very large date sets, use a popover or dialog rather than expanding the result inline. A practical initial threshold is more than six to eight dates. The dialog should include:

- Poll title.
- Total date count.
- Complete date list.
- Local time zone and UTC offset details for timed choices where required.
- A clear close control and Escape-key support.

The threshold should be treated as a presentation rule only; all dates remain available and no data is omitted.

### 3. Improve result hierarchy

The desktop table should give more space to the title and primary metadata, rather than reserving a large fixed percentage for the complete date list. The proposed-date column can become a compact summary column.

Recommended desktop columns:

| Column | Purpose |
| --- | --- |
| Poll | Title and primary navigation action |
| Status | Draft, Open or Closed |
| Created | Original creation date |
| Dates | Count, short preview and disclosure control |
| Participants | Current count |
| Actions | Open poll, if a separate action is needed |

Use stronger row separation or a subtle alternating surface so that long expanded content does not make adjacent polls difficult to distinguish.

### 4. Keep actions close to the poll identity

The poll title should remain the main link. If a separate action is needed, use `Open poll` on desktop and a compact action menu on mobile.

The mobile action menu may contain:

- Open poll.
- View dates.
- Copy public link, if retained as a temporary shortcut during migration.

The preferred end state is to remove public-link management from this menu and keep the dashboard focused on finding and opening polls.

### 5. Add loaded-result feedback

Keep cursor pagination and `Load more polls`, but add a non-authoritative loaded count, for example:

> Showing 25 loaded polls

When a continuation is exhausted, the text can change to indicate that all matching results have been loaded. Do not present the loaded count as a total result count unless the API supplies a reliable total.

Retain the existing distinction between an empty result and a page that is empty but has a continuation.

### 6. Debounce search

Debounce search requests by approximately 250–400 milliseconds, or alternatively submit on Enter while retaining the existing `Clear search` control. Debouncing reduces unnecessary API calls and repeated DOM construction for large result sets.

The existing behaviour should remain intact for:

- Filter changes.
- Search text preservation while changing filters.
- Clear-search focus restoration.
- Stale-response protection.
- Loading, error and no-match states.

## Public-link functionality

### Recommendation

Move public-link management to the actual organiser poll page and remove the per-result share panel from `My polls`.

This gives each page a clear responsibility:

- `My polls`: find, filter and open polls.
- Poll-management page: inspect, manage and share one poll.

It also removes a major source of variable-height content from the dashboard, especially when several share panels are opened in a long result list.

### Poll-page share section

Add a prominent organiser-only `Share poll` section near the poll title or organiser toolbar:

```text
Poll title
Open · 4 participants

[Share poll]
Public link       [••••••••••••••••] [Copy link]
                   [Open as participant]

Link security ▸
```

The section should support:

- Copy public link.
- Open as participant/link holder.
- Native share where supported, as an optional enhancement.
- Retrieve the current link when it is not already present in the page state.
- Regenerate the link under a `Link security` disclosure.
- Existing confirmation and warning behaviour for rotation.

After successful publication, the organiser should land on the poll-management page with the share section visible and the current link ready to copy. The copied-link result should be announced through the existing status/live-region pattern.

### Lifecycle and security rules

- Draft polls must not expose public-link controls before publication.
- Open and closed polls may expose the current link to the organiser.
- Closed polls must still allow the organiser to copy or rotate the current link.
- Link rotation remains organiser-only and invalidates the old link immediately.
- The warning must explain that anyone using the old link needs the replacement.
- Link rotation must not change poll dates, responses, history or lifecycle state.
- The link-holder view must never expose organiser share, history, edit, close or reopen controls.
- Organiser authorisation must be checked before rendering or enabling organiser-only actions.

### Dashboard transition

During migration, a dashboard result may retain a simple `Open poll` action only. Avoid keeping a second full share workflow in both places, because that creates two locations with potentially different link state and rotation affordances.

If a temporary shortcut is required, `Copy public link` should navigate to or open the poll page and focus the share section rather than independently owning the link-management state.

## Responsive behaviour

### Desktop

- Use compact result rows by default.
- Keep the title and status visible while date details are collapsed.
- Allow inline expansion for small date lists.
- Use a dialog for very large date lists.
- Keep `Load more polls` below the result list with loaded-result feedback.

### Mobile

- Use compact cards with title, status, dates summary and participant count.
- Put full dates behind a disclosure or dialog; do not render a 20-date list directly in every card.
- Keep `Open poll` as the primary card action.
- Avoid placing share-link controls in each card.
- Ensure disclosure controls and action menus meet the existing minimum touch-target size.

## Accessibility requirements

- Date disclosure controls must expose state with `aria-expanded` and reference the controlled content with `aria-controls`.
- Expanded date content must be reachable in normal keyboard order.
- Dialog date lists must have a labelled heading, close control and focus restoration.
- Status, loading, pagination and copy-link feedback must continue to use the existing live-region approach.
- Do not use colour alone to communicate lifecycle state; retain visible status text.
- Preserve visible focus indicators for filters, search, disclosures, actions and dialog controls.
- Long titles and timed date labels must wrap without clipping or horizontal page overflow.
- Copy and rotation errors must be specific and actionable.

## Suggested implementation sequence

1. Add a compact proposed-date summary and date count to the existing summary projection.
2. Add accessible inline disclosure for short date lists and a dialog for large lists.
3. Update desktop table and mobile card layouts to use the compact summary.
4. Add loaded-result feedback and debounce search requests.
5. Consolidate the poll-page share section and ensure it supports copy, open-as-participant and rotation.
6. Remove dashboard-specific share-panel creation, reset handling and styling.
7. Update component and end-to-end coverage for long date lists, disclosure state, mobile cards, publication landing, closed-poll sharing and link rotation.

## Acceptance criteria

- A poll with many proposed dates does not produce an excessively tall default row or card.
- Every proposed date remains accessible without truncation or data loss.
- The default list clearly shows title, status, participant count, created date and date count.
- Date expansion works with keyboard and assistive technology.
- The poll page is the single canonical location for public-link management.
- Publishing opens the organiser on the poll page with share controls available.
- Drafts have no public-link controls.
- Open and closed polls allow the organiser to copy the current link.
- Link rotation retains its warning, confirmation and organiser-only access rules.
- The link-holder view never exposes organiser-only controls.
- Search and filter behaviour, pagination, stale-response protection and return-context preservation continue to work.
- The layout remains usable on narrow mobile screens and does not introduce horizontal page overflow.

