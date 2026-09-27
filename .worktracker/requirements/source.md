Invite-a-Gent is a collaborative web application for choosing a date for a group get-together.

Purpose:
An authenticated organiser creates a poll, proposes at least two dates or date-times, optionally supplies a description, instructions, time zone, and plain-text or Markdown location details, then publishes an unguessable shareable link. Anyone with the active link can participate without an account.

Roles and access:
- Organisers create and manage their own polls, dates, location details, audit history, undo actions, final-date selection, lifecycle state, and public-link regeneration.
- Link holders can view the complete shared response table and, while the poll is open, add, rename, delete, or edit any participant row. Rows intentionally have no ownership model.
- Organiser-only actions and ownership must be enforced server-side. Revoked links must cease working.

Lifecycle:
- Draft: organiser-only editing and preview; no participant responses.
- Open: public collaboration is enabled and every successful mutation is audited.
- Closed: a final date is prominent; dates and responses are read-only, but the organiser may still update or clear location details. The poll can later be reopened, retaining the previous selection as provisional.

Core behaviour:
- Participant display names are required and unique per poll using case-insensitive comparison.
- New rows default every date to No.
- Availability is binary Yes/No and can be toggled by mouse or keyboard Space; updates autosave and refresh to the latest server state.
- Concurrent writes use last-update-wins without a conflict warning.
- Each date shows its Yes total.
- The public page ranks up to five dates by descending Yes total, breaking ties by the organiser's original date order. Ranking updates after response changes and undo, and freezes on closure until reopening.

Location details:
Optional location information can be set, edited, or cleared in Draft, Open, or Closed without changing lifecycle state. Plain text and Markdown links are supported, but rendered content must be sanitised and unsafe or executable content rejected. Public views update immediately and every change is audited.

Audit and undo:
Every successful change creates an append-only revision containing the affected entity, action, before/after values, timestamp, and actor category, without credentials or session data. Organisers can view newest-first history and undo individual changes. Undo appends a new revision, preserves original history, warns about later affected changes, and requires confirmation before overwriting newer values.

Finalisation:
Before closing, the organiser reviews the selected date plus Yes and No participant lists and confirms that the poll will close. A closed poll rejects participant writes at both UI and server levels. Reopening requires confirmation, restores editing and live rankings, and records a separate audit event. The organiser can close again with the same or a different date.

Validation and MVP quality:
Prevent invalid or duplicate dates, blank/excessive or duplicate participant names, invalid availability values, mismatched delete confirmations, unsafe/excessive location content, closed-poll writes, revoked-link access, and unauthorised management actions. Errors must be clear and non-sensitive, recoverable input should be preserved, and all 25 MVP acceptance criteria in .docs/user-requirements.md define completion.
