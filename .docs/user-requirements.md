# Get-Together Date Selection Application

## 1. Purpose

The application helps a group choose a suitable date for a get-together. An authenticated organiser proposes several dates and shares a public link. Participants use the link to record their availability, review everyone's responses, and update the shared table. The organiser then selects a final date and closes the poll.

## 2. User Roles

### Organiser

An organiser is an authenticated user who can:

- Create and manage polls.
- Add, edit, reorder, or remove proposed dates.
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
- Proposed dates can be added, edited, reordered, or removed.
- Participant responses cannot be submitted.

### Open

- The poll is accessible through the shareable link.
- Participants can view and modify the shared response table.
- Every change is recorded in the audit history.
- The organiser can select a final date and close the poll.

### Closed

- A final date has been selected.
- The selected date is displayed prominently.
- The poll, proposed dates, and responses are read-only.
- The shareable link remains valid.
- The organiser can reopen the poll.

## 4. Creating and Publishing a Poll

The organiser must be able to:

1. Create a poll with a title.
2. Optionally add a description, location, and instructions.
3. Configure the poll's time zone.
4. Add at least two proposed date or date-and-time options.
5. Preview the poll.
6. Publish it.
7. Copy its unique shareable link.

The application must prevent publication until all required information is valid.

## 5. Recording Availability

The open poll displays one row per participant and one column per proposed date.

Each availability value must support:

- **Yes** - the participant can attend.
- **Maybe** - the participant may be able to attend.
- **No** - the participant cannot attend.

To add a row, a participant must enter a non-empty display name and select an availability value for each proposed date.

Participant names should be unique within a poll using a case-insensitive comparison. The application should offer to edit the matching row when someone attempts to add a duplicate name.

The poll must show separate totals of **Yes** and **Maybe** responses for each proposed date.

## 6. Viewing and Editing Responses

While the poll is open:

- All link holders can see every participant's name and availability.
- Any link holder can add, edit, or remove any participant row.
- No participant account, password, or ownership token is required.
- The interface must make it clear that the table is collaboratively editable.
- Each successful change must create a separate audited revision.
- Concurrent changes must not silently overwrite newer data. The user must be shown the latest version before retrying.

When the poll is closed, all participant modifications must be rejected by both the interface and the server.

## 7. Popular Date Ranking

While a poll is open, the shareable page must display an ordered list of up to five of the most popular proposed dates.

Dates are ranked using these rules, in order:

1. Highest number of **Yes** responses.
2. If two or more dates have the same **Yes** total, highest number of **Maybe** responses.
3. If both totals are equal, the organiser's original proposed-date order.

The ranking must update whenever a response is added, edited, removed, or undone.

If the poll contains fewer than five proposed dates, all dates are shown. **No** totals do not affect the ranking.

Each ranked entry must display:

- Its rank.
- The proposed date and time.
- Its **Yes** total.
- Its **Maybe** total.

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
- Participants who answered **Maybe**.
- Participants who answered **No**.
- A warning that confirming the selection will close the poll.

After confirmation:

- The selected date is recorded.
- The poll moves to the **Closed** state.
- The selected date is prominently displayed on the public page.
- All poll data becomes read-only.
- Modification attempts are rejected.
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
- Participants do not require authentication.
- Each public poll must use a unique, unguessable link.
- Possession of the link grants permission to view and edit the open poll.
- Organiser-only actions must be authorised on the server.
- The organiser must be able to revoke and regenerate the public link.

Regenerating the link must invalidate the previous link without deleting the poll or its history.

## 12. Validation and Error Handling

The application must:

- Reject invalid or duplicate proposed dates.
- Reject blank or excessively long participant names.
- Reject incomplete or invalid availability values.
- Prevent participant changes while a poll is closed.
- Prevent edits using a revoked link.
- Return clear error messages without exposing sensitive system information.
- Preserve entered data after recoverable validation errors.

## 13. MVP Acceptance Criteria

The MVP is complete when:

1. An authenticated organiser can create a poll with multiple proposed dates.
2. The organiser can publish it and copy an unguessable public link.
3. Anyone with the link can view all responses.
4. Anyone with the link can add, edit, or remove any participant row while the poll is open.
5. Each date supports **Yes**, **Maybe**, and **No** responses.
6. The poll displays **Yes** and **Maybe** totals for every date.
7. The shareable page displays no more than five ranked dates.
8. Dates are ranked by **Yes** total descending, followed by **Maybe** total descending.
9. Dates tied on both totals retain the organiser's original proposed-date order.
10. The ranking updates after every successful response change or undo.
11. Every change creates an immutable audit entry.
12. The organiser can undo a change without removing its original audit entry.
13. The organiser can select a proposed date and close the poll.
14. A closed poll rejects all participant modifications and clearly displays the selected date.
15. Closing the poll freezes the ranking until the poll is reopened.
16. The organiser can reopen the poll, after which editing is enabled again and the former selection is marked provisional.
17. The organiser can close the poll again with the same or a different date.
18. The organiser can revoke and regenerate the public link.
19. All organiser-only operations are protected by server-side authorisation.
