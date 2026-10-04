# Acceptance Use Cases and User Stories

## Purpose

This document translates `user-requirements.md` into observable acceptance scenarios. The scenarios are intended to be automated with Playwright and run locally. They describe required behaviour, not page structure, selector names, routes, or implementation details.

The [My polls acceptance supplement](acceptance-use-cases-my-polls.md) adds MP-US-01–11 for the organiser landing page, owned summaries, discovery and lifecycle navigation, with [links to executable coverage](acceptance-use-cases-my-polls.md#story-traceability-and-delivery-boundaries) and resolved [dashboard requirements](user-requirements-my-polls.md). Existing US-01–US-38 remain authoritative for lifecycle, collaboration, audit and authorization. Dashboard reads add no mutations or audit revisions; local identity and stubbed Lambda claims do not verify deployed Cognito sign-in.

## Test conventions

- **Organiser** means an authenticated user who owns the poll.
- **Link holder** means an unauthenticated user using the current public poll link.
- Use a separate browser context for the organiser and each link holder so authentication and concurrency behaviour are realistic.
- Dates displayed to users must be asserted in the poll's configured time zone.
- Verify server-enforced rules with Playwright's API request support as well as disabled or absent UI controls. A hidden control alone is not evidence of authorization.
- For every successful mutation, assert both the visible result and the corresponding audit entry unless the scenario explicitly tests an unsuccessful mutation.
- Avoid asserting generated identifiers or exact timestamps. Assert identifier shape/uniqueness and timestamps within the test's execution window.
- Copy-link scenarios may read the browser clipboard when available or assert the value exposed by the copy control.
- Participant names are trimmed at their boundaries, limited to 100 Unicode code points, and compared using NFKC normalisation plus locale-independent case folding; internal whitespace is preserved.
- Location source is limited to 4,000 Unicode code points. Supported Markdown comprises paragraphs, line breaks, emphasis, strong emphasis, ordered and unordered lists, and `https:` links. Raw HTML and other link schemes are rejected, and rendered output is sanitised.
- Date-only options retain their local date. Timed options use the poll's IANA time zone; nonexistent local times are rejected and ambiguous local times require an explicit UTC-offset choice.
- Public tokens are 192-bit cryptographically random Base64URL values whose raw form is never persisted.
- Selecting the final date and closing the poll creates exactly one atomic audit revision; reopening creates another revision.
- Assert stable API error codes and semantic visible messages rather than exact prose: `400` validation, `401` authentication, `403` ownership, `404` unknown resource or link, `409` uniqueness, `410` revoked link, `422` lifecycle, and `429` throttling.

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

Given I am authenticated as an organiser
When I create a poll with valid required details but omit description, location details, and instructions
Then the poll is saved as a valid Draft with those optional fields empty
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

### US-09 — Add a participant row with default availability

**As a link holder, I want to add a named row so that I can record availability in the shared table.**

```gherkin
Given I am viewing an open poll with three proposed dates
When I choose to add a new row
Then I am prompted for a participant name

When I enter the display name "Alice"
Then one row named "Alice" is shown
And all three availability cells in that row show No
And the row is inserted without a separate save action
And exactly one new audit revision records the addition by an anonymous link holder
```

### US-10 — Require a valid participant name and availability value

**As a link holder, I want clear validation so that invalid shared-table data is not saved.**

```gherkin
Scenario Outline: Invalid participant row is rejected
  Given I am modifying an open poll
  When I attempt to save <invalid input>
  Then the invalid change is rejected by the server
  And no audit revision is created for the failed submission
  And I see a clear validation error without sensitive system details
  And any recoverable entered data is preserved

  Examples:
    | invalid input                                      |
    | a blank display name                               |
    | a display name longer than the configured maximum |
    | an availability value other than Yes or No         |
```

### US-11 — Handle duplicate names case-insensitively

**As a link holder, I want duplicate names rejected so that each row is unambiguous.**

```gherkin
Given the open poll contains a participant named "Alice"
When I attempt to add a participant named "alice"
Then a second row is not created
And I am told that the name already exists
And the existing "Alice" row is unchanged
And no audit revision is created
```

### US-12 — Toggle any availability cell by mouse or keyboard

**As a link holder, I want to toggle any availability cell so that the shared document can be updated collaboratively and accessibly.**

```gherkin
Scenario: A link holder toggles a cell by mouse and keyboard
Given an open poll contains Bob's participant row
And I am an unauthenticated link holder who did not create that row
When I click Bob's first availability cell, changing it from No to Yes
Then Bob's row shows Yes for the first date
And the affected totals are recalculated
And the update is sent automatically without a separate save action
And exactly one new audit revision records the previous and new values
And the revision identifies the actor as an anonymous link holder

When I focus Bob's first availability cell and press the Space bar
Then the cell changes from Yes to No
And the second update is sent automatically and creates its own audit revision

Scenario: The organiser edits a participant response
Given I am the authenticated organiser of an Open poll containing Alice's row
When I toggle one of Alice's availability cells
Then the updated value and totals are displayed from the latest server state
And a new audit revision identifies me as the organiser
```

### US-13 — Rename any participant row to a unique name

**As a link holder, I want to rename any row so that participant names can be corrected collaboratively.**

```gherkin
Given an open poll contains Bob's participant row
And I am an unauthenticated link holder who did not create that row
When I choose to rename Bob's row
Then I am prompted for a new name

When I enter "Robert"
Then the row is displayed as "Robert" with its availability unchanged
And the update is sent automatically without a separate save action
And exactly one new audit revision records the old and new names

When I attempt to rename Robert's row to "alice" while an "Alice" row exists
Then the rename is rejected using case-insensitive comparison
And Robert's row remains unchanged
And no audit revision is created for the rejected rename
```

### US-14 — Remove any participant row with name confirmation

**As a link holder, I want to remove any row so that obsolete responses can be cleaned up.**

```gherkin
Given an open poll contains Charlie's participant row
And I am an unauthenticated link holder who did not create that row
When I request to remove Charlie's row
And I enter a name other than the row's current name
Then the row is not removed
And a clear confirmation error is shown
And no audit revision is created

When I request to remove Charlie's row again
And I enter its current name "Charlie"
Then Charlie's row is no longer displayed
And the date totals are recalculated
And exactly one new audit revision records the removed values
```

### US-15 — Display the Yes total for every date

**As a link holder, I want a Yes total per date so that I can compare attendance.**

```gherkin
Given an open poll has these responses for a proposed date:
  | participant | availability |
  | Alice       | Yes          |
  | Bob         | Yes          |
  | Charlie     | No           |
  | Dana        | No           |
When I view the response table
Then that date shows a Yes total of 2
And the No responses are not included in that total
```

### US-16 — Apply concurrent updates using last-update-wins

**As a collaborator, I want the table refreshed from the server so that I see the latest accepted state.**

```gherkin
Given two unauthenticated browser contexts display the same version of Alice's row
When the first context changes Alice's first answer from No to Yes
And the second context subsequently changes that answer to No from its stale view
Then both accepted updates create separate audit revisions
And the later accepted update wins without a conflict warning
And both contexts refresh to the latest server state showing No when they receive that newer state
```

## Use case UC-04: Rank popular dates

**Primary actor:** Link holder  
**Goal:** Compare the strongest date choices.  
**Success outcome:** Up to five dates are ordered deterministically from current response totals.

### US-17 — Rank by Yes, then original order

**As a link holder, I want dates ranked consistently so that the most viable choices appear first.**

```gherkin
Given an open poll has dates in original order A, B, C, and D
And their totals are:
  | date | Yes | No |
  | A    | 3   | 0  |
  | B    | 4   | 9  |
  | C    | 3   | 2  |
  | D    | 3   | 8  |
When I view the popular-date ranking
Then the order is B, A, C, D
And A, C, and D retain their original order because their Yes totals tie
And the No totals do not affect the order
And each entry shows its rank, date and time, and Yes total
```

### US-18 — Limit the ranking to five entries

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

### US-19 — Re-rank after every successful response mutation or undo

**As a link holder, I want rankings updated after changes so that the list reflects current availability.**

```gherkin
Scenario Outline: A response mutation or undo refreshes the ranking
  Given an open poll has a known popular-date order
  When <mutation> occurs successfully
  Then the Yes totals reflect the mutation
  And the popular-date ranking is immediately recalculated from those totals

  Examples:
    | mutation                    |
    | adds a participant row      |
    | edits a participant row     |
    | removes a participant row   |
    | undoes a response change    |
```

## Use case UC-05: Audit and undo changes

**Primary actor:** Organiser  
**Goal:** Inspect immutable history and safely reverse a change.  
**Success outcome:** History remains intact and undo produces a new revision restoring prior data.

### US-20 — View complete history in reverse chronological order

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

### US-21 — Undo an isolated change without erasing history

**As an organiser, I want to undo a change so that mistakes can be corrected without rewriting history.**

```gherkin
Given the latest change updated Alice's first answer from Yes to No
When I undo that change
Then Alice's first answer is restored to Yes
And the totals and ranking are recalculated
And the original update revision remains unchanged in the history
And a newer, separate audit revision describes the undo and its restored values
```

### US-22 — Warn when undo may affect later work

**As an organiser, I want a warning before undo overwrites newer values so that I can avoid accidental data loss.**

```gherkin
Given one revision changed Alice's first answer from Yes to No
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

### US-23 — Reject audit access and undo for link holders

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
**Success outcome:** The selected date is prominent, proposed dates and participant responses are read-only, and the organiser may still maintain location details.

### US-24 — Review attendance before confirming a final date

**As an organiser, I want to review responses for my chosen date so that I can make an informed final decision.**

```gherkin
Given an open poll has participant responses
When I choose one of its proposed dates as the final date
Then before confirmation I see the selected date
And I see separate lists of participants who answered Yes and No for that date
And I see a warning that confirmation will close the poll
And cancelling leaves the poll Open with no final selection recorded
```

### US-25 — Confirm the final date and freeze the poll

**As an organiser, I want confirmation to close the poll so that the result cannot be altered accidentally.**

```gherkin
Given I am reviewing a proposed final date for an open poll
When I confirm the selection
Then that proposed date is recorded as the final date
And the poll enters the Closed state
And the public page displays the selected date prominently
And proposed dates and participant responses are read-only
And only the authenticated organiser can still change the optional location details
And the audit history records the selection and closure
```

### US-26 — Reject closed-poll response and proposed-date modifications

**As an organiser, I want response and proposed-date data on a closed poll enforced as read-only so that its recorded result is reliable.**

```gherkin
Given a poll is Closed
When a link holder opens the public page
Then controls for adding, editing, or removing participant rows are unavailable
And proposed-date modification controls are unavailable to the organiser

When the link holder sends direct requests to add, edit, or remove a participant row
Then each request is rejected by the server

When the organiser sends direct requests to add, edit, reorder, or remove proposed dates
Then each request is rejected by the server
And no poll data, totals, ranking, or audit history is changed
```

### US-27 — Freeze the closed ranking

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

### US-28 — Require confirmation to reopen

**As an organiser, I want reopening to be deliberate so that a final poll is not changed accidentally.**

```gherkin
Given I am viewing a Closed poll as its organiser
When I request to reopen it
Then I am asked for explicit confirmation
And cancelling leaves proposed dates and participant responses read-only
And no reopening audit revision is created
```

### US-29 — Reopen and restore editing

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

### US-30 — Close a reopened poll with the same or another date

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

### US-31 — Enforce organiser authorization on the server

**As an organiser, I want management actions server-protected so that public users cannot control the poll.**

```gherkin
Scenario Outline: Link holder cannot perform organiser action
  Given I am unauthenticated and possess a valid public link
  When I directly attempt to <organiser action>
  Then the server rejects the request as unauthorized
  And the poll and audit history are unchanged

  Examples:
    | organiser action                    |
    | edit organiser-managed poll details    |
    | set, edit, or clear location details |
    | add, edit, reorder, or remove dates |
    | publish a draft                     |
    | view audit history                  |
    | undo a revision                     |
    | select and confirm a final date     |
    | reopen a closed poll                |
    | revoke or regenerate a public link  |
```

### US-32 — Prevent one organiser managing another's poll

**As a poll owner, I want ownership enforced so that another authenticated organiser cannot manage my poll.**

```gherkin
Given organiser Olivia owns a poll
And another organiser is authenticated
When the other organiser directly attempts an organiser-only operation on Olivia's poll
Then the server rejects the request as unauthorized
And the poll and audit history are unchanged
```

### US-33 — Revoke and regenerate the public link

**As an organiser, I want to replace the public link so that access through an old link can be stopped.**

```gherkin
Given an Open poll has a working public link
When I revoke and regenerate its public link
Then a different unguessable public link is issued
And the old link can no longer view or modify the poll
And the new link opens the same poll with its existing dates, responses, state, and history intact
And an unauthenticated user can modify the Open poll through the new link
And the audit history records the link regeneration without exposing either link token
```

### US-34 — Reject modifications through a revoked link

**As an organiser, I want revoked links enforced by the server so that cached pages cannot retain write access.**

```gherkin
Given a link holder loaded an Open poll using its old public link
And the organiser has since regenerated the link
When the link holder uses the stale page or a direct request to add, edit, or remove a response
Then the server rejects the request
And a clear, non-sensitive invalid-link message is shown
And no poll data or audit revision is created
```

## Use case UC-09: Maintain and safely display location details

**Primary actor:** Organiser
**Goal:** Keep optional location information accurate throughout the poll lifecycle.
**Success outcome:** Safe plain text or Markdown location details are immediately visible where appropriate, while only the poll's organiser can change them.

### US-35 — Save and safely render optional location details

**As an organiser, I want plain-text or Markdown location details so that participants can find the venue or meeting link.**

```gherkin
Scenario Outline: Render supported location details
  Given I am creating a valid draft poll
  When I save <location details>
  Then the location details are saved
  And the organiser preview displays <rendered result>
  And executable content is not present in the rendered output

  Examples:
    | location details                                      | rendered result                              |
    | Community Hall                                       | the plain text "Community Hall"              |
    | Community Hall — [map](https://example.test/map)     | a "map" link with the expected safe target  |

Scenario: Display saved location details on the public poll
Given the poll with location details is published
When a link holder opens the public poll
Then the same safely rendered location details are displayed
```

### US-36 — Change or clear location details in every lifecycle state

**As an organiser, I want to maintain location details without changing the poll's lifecycle state so that late venue changes remain possible.**

```gherkin
Scenario Outline: Set previously absent location without changing lifecycle state
  Given I own a poll in the <state> state without location details
  When I set the location details to "Community Hall"
  Then the poll remains in the <state> state
  And <visible surface> immediately displays "Community Hall"
  And a new audit revision records an empty previous value and "Community Hall" as the new value

  Examples:
    | state  | visible surface             |
    | Draft  | the organiser preview       |
    | Open   | the public poll             |
    | Closed | the closed public poll      |

Scenario Outline: Edit location without changing lifecycle state
  Given I own a poll in the <state> state with location details "Community Hall"
  When I change the location details to "Riverside Room"
  Then the poll remains in the <state> state
  And the saved location is "Riverside Room"
  And <visible surface> immediately displays "Riverside Room"
  And a new audit revision records "Community Hall" as the previous value and "Riverside Room" as the new value

  Examples:
    | state  | visible surface             |
    | Draft  | the organiser preview       |
    | Open   | the public poll             |
    | Closed | the closed public poll      |

Scenario Outline: Clear location without changing lifecycle state
  Given I own a poll in the <state> state with location details "Community Hall"
  When I clear the location details
  Then the poll remains in the <state> state
  And <visible surface> no longer displays location details
  And a new audit revision records "Community Hall" as the previous value and an empty new value

  Examples:
    | state  | visible surface             |
    | Draft  | the organiser preview       |
    | Open   | the public poll             |
    | Closed | the closed public poll      |
```

### US-37 — Reject unsafe or excessive location details

**As an organiser, I want unsafe location content rejected so that the public poll cannot execute or link to harmful content.**

```gherkin
Scenario Outline: Invalid location details are not saved
  Given I am editing location details as the poll's authenticated organiser
  And the poll has existing location details
  When I attempt to save <invalid location>
  Then the location change is rejected
  And I see a clear error without sensitive system details
  And my entered location value is preserved for correction when the error is recoverable
  And the previously saved and rendered location remains unchanged
  And no audit revision is created for the rejected change

  Examples:
    | invalid location                                      |
    | content longer than the supported maximum             |
    | Markdown that cannot be rendered safely               |
    | a link with an unsafe executable target               |
    | executable content                                    |
```

### US-38 — Restrict location changes to the owning organiser

**As an organiser, I want location changes server-protected so that public users and other organisers cannot alter them.**

```gherkin
Scenario Outline: Unauthorized location change is rejected
  Given Olivia owns a poll in the <state> state
  When <unauthorized actor> directly attempts to set, edit, or clear its location details
  Then the server rejects the request as unauthorized
  And the saved and rendered location remains unchanged
  And no audit revision is created

  Examples:
    | state  | unauthorized actor                         |
    | Draft  | another authenticated organiser           |
    | Open   | an unauthenticated holder of the public link |
    | Closed | an unauthenticated holder of the public link |
    | Closed | another authenticated organiser           |
```

## Requirement traceability

| Requirement area | Acceptance stories |
| --- | --- |
| Roles and permissions | US-01, US-08, US-12–US-14, US-23, US-31, US-32, US-38 |
| Draft, Open, and Closed lifecycle | US-01, US-04, US-06, US-07, US-25–US-30, US-36 |
| Poll creation and publication | US-01–US-07 |
| Location details and safe Markdown | US-01, US-05, US-31, US-35–US-38 |
| Availability and validation | US-08–US-16 |
| Popular-date ranking | US-15, US-17–US-19, US-21, US-22, US-27, US-29 |
| Audit history and undo | US-09, US-12–US-14, US-20–US-23, US-25, US-29, US-30, US-36 |
| Final-date selection | US-24–US-27, US-30 |
| Reopening | US-28–US-30 |
| Authentication and public links | US-06, US-07, US-23, US-31–US-34, US-38 |
| Errors, concurrency, and server enforcement | US-03, US-04, US-10, US-11, US-13, US-14, US-16, US-22, US-26, US-31–US-34, US-37, US-38 |
| My polls landing, ownership and responsive summaries | [MP-US-01–MP-US-03](acceptance-use-cases-my-polls.md#use-case-mp-uc-01-enter-my-polls-and-review-owned-polls); US-31, US-32 |
| My polls creation ordering, lifecycle filters and title search | [MP-US-04–MP-US-06](acceptance-use-cases-my-polls.md#story-traceability-and-delivery-boundaries) |
| My polls creation, title navigation and publication returns | [MP-US-07–MP-US-09](acceptance-use-cases-my-polls.md#use-case-mp-uc-03-create-and-manage-polls-from-the-dashboard); US-01–US-07 |
| My polls refreshed close/reopen membership and public isolation | [MP-US-10–MP-US-11](acceptance-use-cases-my-polls.md#story-traceability-and-delivery-boundaries); US-24–US-34, US-36, US-38 |

## Resolved implementation decisions

- Participant-name and location limits, normalisation, safe Markdown, public-token format, time-zone edge cases, error-code semantics, undo overwrite behaviour, and close/reopen audit granularity are fixed by the test conventions above and the corresponding requirements and architecture sections.
- When a confirmed undo targets a value changed by a later revision, it restores the selected revision's documented previous value. If that would create structurally invalid state, the request is rejected atomically.
- Implementation-specific tests may choose accessible labels and selectors, but must not weaken these behavioural rules.
- My polls uses the supplement's resolved title normalization, date/count presentation, sparse continuation and state-copy decisions. Its read-only discovery assertions preserve complete application/audit snapshots; lifecycle journey assertions retain atomic close, separate confirmed reopen, provisional selection, closed-write rejection and owner-only location maintenance. Existing-poll returns retain search/filter and refresh from page one; new creation returns to default Active. Browser restoration is currently tested with dispatched component events, not a native cache acceptance run.

## Playwright implementation notes

- Prefer role, label, and visible-name locators over CSS structure so tests describe user behaviour.
- Seed only authentication prerequisites. Create polls and responses through the UI when exercising user journeys; use API setup selectively for ranking matrices and concurrency fixtures.
- Capture the audit revision count before a mutation and assert a one-entry increment for actions specified as separate revisions.
- For concurrency, load both contexts before either update, then send their update requests in a controlled order and assert the later accepted update is the visible server state.
- For rejected writes, snapshot the table, totals, ranking, and audit revision count before the request and assert all remain unchanged afterward.
- Run critical public-page scenarios in a fresh unauthenticated context to prevent an organiser session from masking access-control defects.
