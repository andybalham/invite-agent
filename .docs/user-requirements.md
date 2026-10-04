# Get-Together Date Selection Application

## 1. Purpose

The application helps a group choose a suitable date for a get-together. An authenticated organiser proposes several dates and shares a public link. Participants use the link to record their availability, review everyone's responses, and update the shared table. The organiser then selects a final date and closes the poll.

The normal organiser landing page is My polls. The [My polls requirements supplement](user-requirements-my-polls.md) records resolved dashboard decisions and implemented local behaviour; [MP-US-01–11 acceptance and test traceability](acceptance-use-cases-my-polls.md#story-traceability-and-delivery-boundaries) covers discovery, navigation and lifecycle returns. These supplement the rules below without changing poll lifecycle, public collaboration, audit or server authorization. Local simulated identity and Lambda adapter tests do not establish deployed Cognito sign-in.

## 2. User Roles

### Organiser

An organiser is an authenticated user who can:

- Create and manage polls.
- Find their owned polls in My polls, using creation ordering, lifecycle filters and title search, and open the existing editor or management view.
- Add, edit, reorder, or remove proposed dates.
- Set and edit optional location details throughout the poll lifecycle, including after the poll has closed.
- Publish a poll and obtain a shareable link.
- View and edit all participant responses.
- Review the complete change history.
- Undo changes.
- Select the final date.
- Close and reopen a poll.

### Participant

A participant does not require an account. Anyone with the shareable link can:

- View the proposed dates.
- View every participant's name and availability.
- Add a participant row.
- Edit or remove any participant row while the poll is open.
- View the selected date after the poll has been closed.

Participant rows have no ownership or edit permissions. The poll is a shared, wiki-like document: anyone with the link can change any response, and unwanted changes are handled through the audit and undo features.

## 3. Poll Lifecycle

### Draft

- The poll is visible only to the organiser.
- The organiser can set or edit the optional location details.
- Proposed dates can be added, edited, reordered, or removed.
- Participant responses cannot be submitted.

### Open

- The poll is accessible through the shareable link.
- The location details, when provided, are displayed on the public poll.
- The organiser can edit the location details.
- Participants can view and modify the shared response table.
- Every change is recorded in the audit history.
- The organiser can select a final date and close the poll.

### Closed

- A final date has been selected.
- The selected date is displayed prominently.
- Proposed dates and participant responses are read-only.
- The organiser can still set, edit, or clear the location details without reopening the poll; updated details are immediately displayed on the public poll.
- The shareable link remains valid.
- The organiser can reopen the poll.

## 4. Creating and Publishing a Poll

The organiser must be able to:

1. Create a poll with a title.
2. Optionally add a description, location details, and instructions.
3. Configure the poll's time zone.
4. Add at least two proposed date or date-and-time options.
5. Preview the poll.
6. Publish it.
7. Copy its unique shareable link.

The application must prevent publication until all required information is valid.

### Location Details

- Location details are optional and may be added during poll creation or set, edited, or cleared later by the authenticated organiser.
- The organiser can change location details while the poll is in the **Draft**, **Open**, or **Closed** state. Changing them does not reopen a closed poll.
- Location details may be entered as plain text or Markdown. Markdown link syntax must be supported so the organiser can embed links, such as a venue website or online meeting URL.
- Rendered Markdown must be sanitised before display and must not allow executable content or unsafe links.
- When location details are present, they must be displayed on the public poll in every publicly accessible lifecycle state.
- Saved location changes must be reflected immediately on the public poll.
- Every location change, including clearing the field, must be recorded in the audit history with its previous and new values.

## 5. Recording Availability

The open poll displays one row per participant and one column per proposed date.

Each availability value must support:

- **Yes** - the participant can attend.
- **No** - the participant cannot attend.

To add a row, a participant must enter a non-empty display name. The new row is inserted only if the name is unique within the poll, and every proposed date initially defaults to **No**.

Participant names must be unique within a poll using a case-insensitive comparison. The application must reject attempts to add or rename a row using a duplicate name.

The poll must show the total number of **Yes** responses for each proposed date.

## 6. Viewing and Editing Responses

While the poll is open:

- All link holders can see every participant's name and availability.
- An option to add a new row prompts for a participant name. If the name is valid and unique, a new row is inserted with that name and all date cells set to **No**.
- Each participant row provides options to rename or delete it.
- Renaming a row prompts for a new name and succeeds only if that name is valid and unique within the poll.
- Deleting a row prompts the user to enter the row's current name and proceeds only when the entered name matches.
- Clicking a date cell toggles its availability between **No** and **Yes**.
- Every date cell can receive keyboard focus. Pressing the Space bar while a date cell has focus toggles its availability between **No** and **Yes**.
- No participant account, password, or ownership token is required.
- The interface must make it clear that the table is collaboratively editable.
- Every add, rename, delete, or availability toggle is saved automatically by sending an update request to the server; no separate save action is required.
- Each successful update must create a separate audited revision.
- Concurrent updates use last-update-wins semantics without a conflict warning.
- The displayed table must always be refreshed to the latest server state after an update and whenever a newer state is received.

When the poll is closed, all participant modifications must be rejected by both the interface and the server.

## 7. Popular Date Ranking

While a poll is open, the shareable page must display an ordered list of up to five of the most popular proposed dates.

Dates are ranked using these rules, in order:

1. Highest number of **Yes** responses.
2. If two or more dates have the same **Yes** total, the organiser's original proposed-date order.

The ranking must update whenever a response is added, edited, removed, or undone.

If the poll contains fewer than five proposed dates, all dates are shown. **No** totals do not affect the ranking.

Each ranked entry must display:

- Its rank.
- The proposed date and time.
- Its **Yes** total.

When the poll is closed, the selected date remains the primary result. The final ranking is retained as read-only supporting information and remains frozen until the poll is reopened.

## 8. Audit History and Undo

The application must retain an append-only audit history for every change, including:

- The affected poll, date, or participant row.
- The type of action performed.
- The values before and after the change.
- The date and time of the change.
- Whether the action was performed by the authenticated organiser or an anonymous link holder.
- The organiser's identity when applicable.

The organiser can view the history in reverse chronological order and undo an individual change.

Undoing a change must:

- Restore the affected data to its previous state.
- Create a new audit entry describing the undo.
- Preserve the original history.
- Warn the organiser if later changes could be affected.
- Require confirmation when the undo would overwrite a newer value.

The audit log must not contain credentials, session identifiers, or other sensitive security data.

## 9. Selecting the Final Date

The organiser can select one of the proposed dates as the final date.

Before confirmation, the application must show:

- The selected date.
- Participants who answered **Yes**.
- Participants who answered **No**.
- A warning that confirming the selection will close the poll.

After confirmation:

- The selected date is recorded.
- The poll moves to the **Closed** state.
- The selected date is prominently displayed on the public page.
- Proposed dates and participant responses become read-only.
- Participant modification attempts are rejected, while the authenticated organiser retains permission to edit the location details.
- The selection is added to the audit history.

## 10. Reopening a Poll

The organiser can reopen a closed poll.

Reopening must:

- Require explicit confirmation.
- Move the poll back to the **Open** state.
- Allow participant changes again.
- Retain the previously selected date but clearly mark it as provisional.
- Record the reopening in the audit history.

The organiser can subsequently choose the same date or a different date and close the poll again. Each selection and reopening must remain visible in the audit history.

## 11. Authentication and Access

- Organiser functions require authentication.
- Setting, editing, or clearing location details is restricted to the authenticated organiser and must be authorised on the server, including when the poll is closed.
- Participants do not require authentication.
- Each public poll must use a unique, unguessable link.
- Possession of the link grants permission to view and edit the open poll.
- Organiser-only actions must be authorised on the server.
- The organiser must be able to revoke and regenerate the public link.

Regenerating the link must invalidate the previous link without deleting the poll or its history.

My polls must return only the current organiser's summaries, with ownership enforced by the server for both listing and opening a poll. Active groups Draft and Open; it is not another lifecycle state. Public links open their poll directly and grant no access to organiser discovery. Dashboard reads must not mutate polls or add audit revisions. Existing-poll returns refresh page one while retaining filter/search; returning after new creation uses Active with blank search. Detailed presentation, normalization, paging and freshness limits are defined in the [My polls supplement](user-requirements-my-polls.md).

## 12. Validation and Error Handling

The application must:

- Reject invalid or duplicate proposed dates.
- Reject blank or excessively long participant names.
- Reject duplicate participant names using a case-insensitive comparison.
- Reject invalid availability values other than **Yes** or **No**.
- Reject a row deletion when the entered confirmation name does not match the row's current name.
- Reject location details that exceed the supported length or contain Markdown that cannot be rendered safely.
- Sanitise rendered location Markdown and reject unsafe link targets or executable content.
- Prevent participant changes while a poll is closed.
- Prevent edits using a revoked link.
- Return clear error messages without exposing sensitive system information.
- Preserve entered data after recoverable validation errors.

### Resolved Validation and Behaviour Rules

- Participant names are trimmed of leading and trailing whitespace before validation and storage. Internal whitespace is preserved.
- A participant name must contain no more than 100 Unicode code points after trimming.
- Participant-name uniqueness uses Unicode NFKC normalisation followed by locale-independent case folding.
- Location details must contain no more than 4,000 Unicode code points before Markdown rendering.
- Supported location Markdown is limited to paragraphs, line breaks, emphasis, strong emphasis, ordered and unordered lists, and links. Raw HTML is rejected.
- Location links must use `https:`. Rendered output is sanitised even after the source has passed validation.
- A public-link token contains 192 bits of cryptographically secure randomness, is Base64URL-encoded, and is stored only as a keyed hash. Regeneration immediately invalidates the previous token.
- Date-only options are stored separately from timed options. Timed options are stored as a UTC instant together with the poll's IANA time zone and the selected UTC offset.
- A local date-time that does not exist because of a daylight-saving transition is rejected. When a local date-time is ambiguous, the organiser must explicitly choose one of the valid UTC offsets.
- Undo is evaluated against current state. If the affected value has changed since the selected revision, the organiser receives a preview and must confirm that the selected revision's previous value will overwrite the newer value. An undo that would create structurally invalid state is rejected atomically.
- Selecting a final date and closing the poll is one atomic mutation and creates exactly one audit revision. Reopening creates a separate revision.
- API errors use stable machine-readable codes. Validation errors return `400`, missing or invalid authentication returns `401`, failed ownership returns `403`, unknown resources or unknown public links return `404`, uniqueness conflicts return `409`, recognised revoked links return `410`, invalid lifecycle transitions return `422`, and throttling returns `429`. User-facing copy must identify the field or reason without exposing internal details; automated acceptance tests assert the error code and semantic message rather than exact prose.

## 13. MVP Acceptance Criteria

The MVP is complete when:

1. An authenticated organiser can create a poll with multiple proposed dates.
2. The organiser can optionally provide plain-text or Markdown location details during poll creation, including embedded links.
3. The organiser can set, edit, or clear location details while the poll is in any lifecycle state, including **Closed**, without reopening it.
4. Saved location changes are immediately visible on the public poll, safely rendered, and recorded in the audit history.
5. The organiser can publish the poll and copy an unguessable public link.
6. Anyone with the link can view all responses.
7. Anyone with the link can add a uniquely named participant row while the poll is open; all date cells initially default to **No**.
8. Anyone with the link can rename a participant row to a unique name or delete a row after entering its current name.
9. Each date supports **Yes** and **No** responses.
10. A user can toggle a date cell by clicking it or by focusing it and pressing the Space bar.
11. Every participant response update is sent automatically to the server without a separate save action.
12. Concurrent updates use last-update-wins semantics without a warning, and the screen displays the latest server state.
13. The poll displays the **Yes** total for every date.
14. The shareable page displays no more than five ranked dates.
15. Dates are ranked by **Yes** total descending, with ties retaining the organiser's original proposed-date order.
16. The ranking updates after every successful response change or undo.
17. Every change creates an immutable audit entry.
18. The organiser can undo a change without removing its original audit entry.
19. The organiser can select a proposed date and close the poll.
20. A closed poll rejects all participant modifications and clearly displays the selected date.
21. Closing the poll freezes the ranking until the poll is reopened.
22. The organiser can reopen the poll, after which editing is enabled again and the former selection is marked provisional.
23. The organiser can close the poll again with the same or a different date.
24. The organiser can revoke and regenerate the public link.
25. All organiser-only operations are protected by server-side authorisation.
26. My polls is the organiser landing page and provides an owned list with equivalent desktop/mobile summaries, newest-created ordering, Active/Draft/Open/Closed filters, title search, Load more and distinct loading/error/empty states.
27. My polls supports creation, title navigation and refreshed lifecycle returns while preserving original creation dates, existing confirmations and direct participant access, as specified by [MP-US-01–11](acceptance-use-cases-my-polls.md#story-traceability-and-delivery-boundaries).
