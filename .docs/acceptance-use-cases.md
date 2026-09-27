# Acceptance Use Cases and User Stories

## Purpose

This document translates `user-requirements.md` into observable acceptance scenarios. The scenarios are intended to be automated with Playwright and run locally. They describe required behaviour, not page structure, selector names, routes, or implementation details.

## Test conventions

- **Organiser** means an authenticated user who owns the poll.
- **Link holder** means an unauthenticated user using the current public poll link.
- Use a separate browser context for the organiser and each link holder so authentication and concurrency behaviour are realistic.
- Dates displayed to users must be asserted in the poll's configured time zone.
- Verify server-enforced rules with Playwright's API request support as well as disabled or absent UI controls. A hidden control alone is not evidence of authorization.
- For every successful mutation, assert both the visible result and the corresponding audit entry unless the scenario explicitly tests an unsuccessful mutation.
- Avoid asserting generated identifiers or exact timestamps. Assert identifier shape/uniqueness and timestamps within the test's execution window.
- Copy-link scenarios may read the browser clipboard when available or assert the value exposed by the copy control.

## Baseline test data

Unless a scenario says otherwise, use:

- Organiser: `olivia@example.test`
- Poll title: `Autumn get-together`
- Description: `Choose every date you could attend.`
- Location: `Community Hall`
- Instructions: `Please respond by Friday.`
- Time zone: `Europe/London`
- Proposed dates in original order:
  1. `2026-10-10 18:00`
  2. `2026-10-17 18:00`
  3. `2026-10-24 18:00`
- Participants: `Alice`, `Bob`, and `Charlie`

Tests should create their own poll and must not depend on execution order.

## Use case UC-01: Create and prepare a draft poll

**Primary actor:** Organiser  
**Goal:** Prepare a valid poll before sharing it.  
**Precondition:** The organiser is authenticated.  
**Success outcome:** A private draft contains valid poll details and at least two unique proposed dates.

### US-01 — Create a draft with required and optional details

**As an organiser, I want to create a poll with useful event details so that invitees understand the event.**

```gherkin
Given I am authenticated as an organiser
When I create a poll with a non-empty title
And I enter a description, location, instructions, and time zone
Then the poll is saved in the Draft state
And the saved details are shown when I return to the poll
And no public participant response can be submitted
```

### US-02 — Manage proposed dates in a draft

**As an organiser, I want to add, edit, reorder, and remove proposed dates so that I can offer the right choices.**

```gherkin
Given I have a draft poll with three proposed dates
When I add a fourth proposed date
And I edit the second proposed date
And I move the fourth date to the first position
And I remove the third date
Then the draft shows the remaining dates with the new values
And their displayed order matches my changes
```

### US-03 — Reject duplicate or invalid proposed dates

**As an organiser, I want invalid date choices rejected so that participants receive a coherent poll.**

```gherkin
Given I am editing a draft poll
When I add a date that duplicates an existing proposed date
Then the date is not added
And I see a clear duplicate-date error

When I enter an invalid proposed date or date-time
Then the date is not added
And I see a clear validation error without sensitive system details
```

### US-04 — Prevent premature publication

**As an organiser, I want publication blocked until the poll is valid so that incomplete polls are not shared.**

```gherkin
Scenario Outline: Invalid draft cannot be published
  Given I am editing a draft poll
  And the draft has <invalid condition>
  When I attempt to publish it
  Then the poll remains in the Draft state
  And no usable public link is issued
  And I see a clear message identifying the invalid field

  Examples:
    | invalid condition                         |
    | a blank title                             |
    | no proposed dates                         |
    | only one proposed date                    |
    | duplicate proposed dates                  |
    | an invalid proposed date or date-time     |
```

### US-05 — Preview without publishing

**As an organiser, I want to preview the poll so that I can check it before sharing.**

```gherkin
Given I have a valid draft poll
When I open its preview
Then I see the title, optional details, time zone, and proposed dates as participants would see them
And the poll remains in the Draft state
And participant responses cannot be submitted from the preview
```

## Use case UC-02: Publish and share a poll

**Primary actor:** Organiser  
**Goal:** Open a valid poll and share an unguessable public link.  
**Success outcome:** The poll is open and accessible without authentication at its current unique link.

### US-06 — Publish and copy a unique public link

**As an organiser, I want a shareable link so that participants can respond without accounts.**

```gherkin
Given I have a valid draft with at least two proposed dates
When I publish the poll
Then the poll enters the Open state
And a public link is displayed
And the public identifier is not a simple sequential value
And the copy-link action exposes that same link
And a new unauthenticated browser context can open the link
And the public page shows the poll details and proposed dates
```

### US-07 — Keep draft polls private

**As an organiser, I want drafts hidden from the public so that unfinished polls cannot receive responses.**

```gherkin
Given I have an unpublished draft poll
When an unauthenticated user attempts to access that poll outside organiser preview
Then the draft content is not disclosed
And the user cannot submit a participant response
```

## Use case UC-03: Record shared availability

**Primary actor:** Link holder  
**Goal:** Add and maintain participant rows in an open poll.  
**Success outcome:** The shared table and totals reflect each successful change.

### US-08 — View all shared responses without signing in

**As a link holder, I want to see everyone's availability so that I understand the group's choices.**

```gherkin
Given an open poll has responses from Alice and Bob
When I open its public link in an unauthenticated browser context
Then I am not required to create an account or enter a password
And I see Alice's and Bob's names
And I see each of their availability values for every proposed date
And the page clearly indicates that the response table is collaboratively editable
```

### US-09 — Add a complete participant row

**As a link holder, I want to add a named response so that my availability is counted.**

```gherkin
Given I am viewing an open poll with three proposed dates
When I enter the display name "Alice"
And I select Yes for the first date, Maybe for the second, and No for the third
And I submit the response
Then one row named "Alice" is shown
And that row shows Yes, Maybe, and No for the respective dates
And the date totals are recalculated
And exactly one new audit revision records the addition by an anonymous link holder
```

### US-10 — Require a valid, complete response

**As a link holder, I want clear validation so that I can correct an incomplete response without re-entering it.**

```gherkin
Scenario Outline: Invalid participant row is rejected
  Given I am adding a row to an open poll
  And I have entered otherwise valid response data
  When I submit <invalid input>
  Then no participant row is created
  And no audit revision is created for the failed submission
  And I see a clear validation error without sensitive system details
  And my other entered values are preserved

  Examples:
    | invalid input                                      |
    | a blank display name                               |
    | a display name longer than the configured maximum |
    | no value for one proposed date                     |
    | an availability value other than Yes, Maybe, or No |
```

### US-11 — Handle duplicate names case-insensitively

**As a link holder, I want a matching response offered for editing so that a duplicate name does not create ambiguity.**

```gherkin
Given the open poll contains a participant named "Alice"
When I attempt to add a participant named "alice"
Then a second row is not created
And I am told that the name already exists
And I am offered a way to edit the existing "Alice" row
And declining the offer leaves the existing row unchanged
```

### US-12 — Edit any participant row

**As a link holder, I want to edit any row so that the shared document can be corrected collaboratively.**

```gherkin
Given an open poll contains Bob's participant row
And I am an unauthenticated link holder who did not create that row
When I change Bob's first availability from No to Yes and save
Then Bob's row shows Yes for the first date
And the affected totals are recalculated
And exactly one new audit revision records the previous and new values
And the revision identifies the actor as an anonymous link holder
```

### US-13 — Remove any participant row

**As a link holder, I want to remove any row so that obsolete responses can be cleaned up.**

```gherkin
Given an open poll contains Charlie's participant row
And I am an unauthenticated link holder who did not create that row
When I remove Charlie's row and complete any required confirmation
Then Charlie's row is no longer displayed
And the date totals are recalculated
And exactly one new audit revision records the removed values
```

### US-14 — Display separate Yes and Maybe totals

**As a link holder, I want separate totals per date so that definite and tentative attendance remain distinct.**

```gherkin
Given an open poll has these responses for a proposed date:
  | participant | availability |
  | Alice       | Yes          |
  | Bob         | Yes          |
  | Charlie     | Maybe        |
  | Dana        | No           |
When I view the response table
Then that date shows a Yes total of 2
And that date shows a Maybe total of 1
And the No response is not included in either total
```

### US-15 — Prevent silent concurrent overwrite

**As a collaborator, I want conflicts surfaced so that I do not unknowingly erase a newer response.**

```gherkin
Given two unauthenticated browser contexts display the same version of Alice's row
When the first context changes Alice's first answer to Yes and saves successfully
And the second context changes the stale row's first answer to No and attempts to save
Then the second change does not silently overwrite the first change
And the second context is told that newer data exists
And the latest saved row containing Yes is shown before a retry is allowed
And the failed stale write creates no successful-change audit revision
```

## Use case UC-04: Rank popular dates

**Primary actor:** Link holder  
**Goal:** Compare the strongest date choices.  
**Success outcome:** Up to five dates are ordered deterministically from current response totals.

### US-16 — Rank by Yes, then Maybe, then original order

**As a link holder, I want dates ranked consistently so that the most viable choices appear first.**

```gherkin
Given an open poll has dates in original order A, B, C, and D
And their totals are:
  | date | Yes | Maybe | No |
  | A    | 3   | 1     | 0  |
  | B    | 4   | 0     | 9  |
  | C    | 3   | 2     | 0  |
  | D    | 3   | 1     | 8  |
When I view the popular-date ranking
Then the order is B, C, A, D
And A remains ahead of D because their Yes and Maybe totals tie and A was proposed first
And the No totals do not affect the order
And each entry shows its rank, date and time, Yes total, and Maybe total
```

### US-17 — Limit the ranking to five entries

**As a link holder, I want a concise ranking so that the leading choices are easy to scan.**

```gherkin
Scenario: More than five dates
  Given an open poll has six proposed dates
  When I view the popular-date ranking
  Then exactly five ranked entries are shown
  And they are the top five according to the ranking rules

Scenario: Fewer than five dates
  Given an open poll has three proposed dates
  When I view the popular-date ranking
  Then all three dates are shown in ranked order
```

### US-18 — Re-rank after every successful response mutation

**As a link holder, I want rankings updated after changes so that the list reflects current availability.**

```gherkin
Scenario Outline: A response mutation refreshes the ranking
  Given an open poll has a known popular-date order
  When a link holder successfully <mutation>
  Then the Yes and Maybe totals reflect the mutation
  And the popular-date ranking is immediately recalculated from those totals

  Examples:
    | mutation                    |
    | adds a participant row      |
    | edits a participant row     |
    | removes a participant row   |
```

## Use case UC-05: Audit and undo changes

**Primary actor:** Organiser  
**Goal:** Inspect immutable history and safely reverse a change.  
**Success outcome:** History remains intact and undo produces a new revision restoring prior data.

### US-19 — View complete history in reverse chronological order

**As an organiser, I want a complete audit trail so that I can understand every change.**

```gherkin
Given a poll has changes to poll details, proposed dates, participant rows, and lifecycle state
When I open its audit history as the authenticated organiser
Then every successful change appears as a separate revision
And revisions are ordered newest first
And each revision identifies the affected poll, date, or row
And each revision shows the action, before and after values, and change time
And each revision distinguishes organiser actions from anonymous link-holder actions
And organiser revisions identify the organiser
And no revision displays credentials, session identifiers, or other sensitive security data
```

### US-20 — Undo an isolated change without erasing history

**As an organiser, I want to undo a change so that mistakes can be corrected without rewriting history.**

```gherkin
Given the latest change updated Alice's first answer from Maybe to No
When I undo that change
Then Alice's first answer is restored to Maybe
And the totals and ranking are recalculated
And the original update revision remains unchanged in the history
And a newer, separate audit revision describes the undo and its restored values
```

### US-21 — Warn when undo may affect later work

**As an organiser, I want a warning before undo overwrites newer values so that I can avoid accidental data loss.**

```gherkin
Given one revision changed Alice's first answer from Maybe to No
And a later revision changed the same answer from No to Yes
When I request an undo of the earlier revision
Then I am warned that later changes may be affected
And explicit confirmation is required because the undo would overwrite the newer value
And cancelling leaves the row, totals, ranking, and history unchanged

When I request the undo again and explicitly confirm it
Then the documented previous value is restored
And a separate undo revision is appended without altering either original revision
And totals and ranking are recalculated
```

### US-22 — Reject audit access and undo for link holders

**As an organiser, I want history controls protected so that possession of a public link does not grant management access.**

```gherkin
Given I am unauthenticated and possess a valid public link
When I attempt to access the organiser's audit history or invoke undo directly
Then the server rejects the request as unauthorized
And no poll data or audit history is changed
```

## Use case UC-06: Select a final date and close the poll

**Primary actor:** Organiser  
**Goal:** Confirm one proposed date as the result.  
**Success outcome:** The selected date is prominent and all poll data is read-only.

### US-23 — Review attendance before confirming a final date

**As an organiser, I want to review responses for my chosen date so that I can make an informed final decision.**

```gherkin
Given an open poll has participant responses
When I choose one of its proposed dates as the final date
Then before confirmation I see the selected date
And I see separate lists of participants who answered Yes, Maybe, and No for that date
And I see a warning that confirmation will close the poll
And cancelling leaves the poll Open with no final selection recorded
```

### US-24 — Confirm the final date and freeze the poll

**As an organiser, I want confirmation to close the poll so that the result cannot be altered accidentally.**

```gherkin
Given I am reviewing a proposed final date for an open poll
When I confirm the selection
Then that proposed date is recorded as the final date
And the poll enters the Closed state
And the public page displays the selected date prominently
And poll details, proposed dates, and participant responses are read-only
And a separate audit revision records the selection and closure
```

### US-25 — Reject all closed-poll modifications at UI and server

**As an organiser, I want a closed poll enforced as read-only so that its recorded result is reliable.**

```gherkin
Given a poll is Closed
When a link holder opens the public page
Then controls for adding, editing, or removing participant rows are unavailable

When the link holder sends direct requests to add, edit, or remove a participant row
Then each request is rejected by the server
And no poll data, totals, ranking, or audit history is changed
```

### US-26 — Freeze the closed ranking

**As a viewer, I want the closing-time ranking retained so that it supports the final result consistently.**

```gherkin
Given a poll has just been closed with a known ranking
When I reload the public page or open it in another browser context
Then the same final ranking is displayed read-only
And the selected final date remains the primary result even if it was not ranked first
```

## Use case UC-07: Reopen and close again

**Primary actor:** Organiser  
**Goal:** Resume collaboration while preserving the prior selection history.  
**Success outcome:** The poll is open again, the former date is provisional, and a later closure is possible.

### US-27 — Require confirmation to reopen

**As an organiser, I want reopening to be deliberate so that a final poll is not changed accidentally.**

```gherkin
Given I am viewing a Closed poll as its organiser
When I request to reopen it
Then I am asked for explicit confirmation
And cancelling leaves the poll Closed and read-only
And no reopening audit revision is created
```

### US-28 — Reopen and restore editing

**As an organiser, I want to reopen a poll so that availability can be updated again.**

```gherkin
Given a poll is Closed with a selected final date
When I confirm reopening it
Then the poll enters the Open state
And participant changes are enabled again
And the previously selected date is retained and clearly marked provisional
And a separate audit revision records the reopening
And the popular-date ranking becomes live again
```

### US-29 — Close a reopened poll with the same or another date

**As an organiser, I want to make a new final decision after reopening so that the outcome reflects later responses.**

```gherkin
Scenario Outline: Close a reopened poll
  Given a poll was closed, reopened, and may have new responses
  When I select <selection> and confirm closure
  Then the poll is Closed with that date as the current final date
  And the public page prominently displays that date
  And the audit history retains the earlier selection, reopening, and new selection as separate revisions

  Examples:
    | selection                          |
    | the same proposed date as before   |
    | a different proposed date          |
```

## Use case UC-08: Secure organiser actions and public-link lifecycle

**Primary actor:** Organiser  
**Goal:** Protect management operations and replace compromised public links.  
**Success outcome:** Only authorized organisers manage polls, and only the current link works.

### US-30 — Enforce organiser authorization on the server

**As an organiser, I want management actions server-protected so that public users cannot control the poll.**

```gherkin
Scenario Outline: Link holder cannot perform organiser action
  Given I am unauthenticated and possess a valid public link
  When I directly attempt to <organiser action>
  Then the server rejects the request as unauthorized
  And the poll and audit history are unchanged

  Examples:
    | organiser action                    |
    | edit poll details                   |
    | add, edit, reorder, or remove dates |
    | publish a draft                     |
    | view audit history                  |
    | undo a revision                     |
    | select and confirm a final date     |
    | reopen a closed poll                |
    | revoke or regenerate a public link  |
```

### US-31 — Prevent one organiser managing another's poll

**As a poll owner, I want ownership enforced so that another authenticated organiser cannot manage my poll.**

```gherkin
Given organiser Olivia owns a poll
And another organiser is authenticated
When the other organiser directly attempts an organiser-only operation on Olivia's poll
Then the server rejects the request as unauthorized
And the poll and audit history are unchanged
```

### US-32 — Revoke and regenerate the public link

**As an organiser, I want to replace the public link so that access through an old link can be stopped.**

```gherkin
Given an Open poll has a working public link
When I revoke and regenerate its public link
Then a different unguessable public link is issued
And the old link can no longer view or modify the poll
And the new link opens the same poll with its existing dates, responses, state, and history intact
And an unauthenticated user can modify the Open poll through the new link
```

### US-33 — Reject modifications through a revoked link

**As an organiser, I want revoked links enforced by the server so that cached pages cannot retain write access.**

```gherkin
Given a link holder loaded an Open poll using its old public link
And the organiser has since regenerated the link
When the link holder uses the stale page or a direct request to add, edit, or remove a response
Then the server rejects the request
And a clear, non-sensitive invalid-link message is shown
And no poll data or audit revision is created
```

## Requirement traceability

| Requirement area | Acceptance stories |
| --- | --- |
| Roles and permissions | US-01, US-08, US-12, US-13, US-22, US-30, US-31 |
| Draft, Open, and Closed lifecycle | US-01, US-04, US-06, US-07, US-24–US-29 |
| Poll creation and publication | US-01–US-07 |
| Availability and validation | US-08–US-15 |
| Popular-date ranking | US-14, US-16–US-18, US-20, US-21, US-26, US-28 |
| Audit history and undo | US-09, US-12, US-13, US-19–US-22, US-24, US-28, US-29 |
| Final-date selection | US-23–US-26, US-29 |
| Reopening | US-27–US-29 |
| Authentication and public links | US-06, US-07, US-22, US-30–US-33 |
| Errors, concurrency, and server enforcement | US-03, US-04, US-10, US-15, US-21, US-25, US-30–US-33 |

## Details to resolve before implementation-specific Playwright tests

The source requirements intentionally do not define the following. These decisions should be made before selectors and exact assertions are finalized:

- Maximum participant-name length and whether names are trimmed before uniqueness checks.
- Exact validation and authorization status codes and user-facing messages.
- The required entropy or format used to classify a public link as “unguessable.”
- Whether public-link regeneration itself creates an audit revision.
- Whether organiser changes made during Draft are included in the same audit history described as “every change.”
- The exact undo result when an older revision affects a value that has since changed; US-21 asserts the required warning and confirmation but not an unspecified merge strategy.
- How daylight-saving gaps or ambiguous local times are handled for configured time zones.
- Whether final-date selection and closure are represented by one audit revision or two; the tests only require the complete action to be recorded without over-specifying storage design.

## Playwright implementation notes

- Prefer role, label, and visible-name locators over CSS structure so tests describe user behaviour.
- Seed only authentication prerequisites. Create polls and responses through the UI when exercising user journeys; use API setup selectively for ranking matrices and concurrency fixtures.
- Capture the audit revision count before a mutation and assert a one-entry increment for actions specified as separate revisions.
- For concurrency, load both contexts before either saves, then submit one request followed by the stale request from the other context.
- For rejected writes, snapshot the table, totals, ranking, and audit revision count before the request and assert all remain unchanged afterward.
- Run critical public-page scenarios in a fresh unauthenticated context to prevent an organiser session from masking access-control defects.
