# Handoff: Gather — get-together date poll

## Overview
Gather lets an authenticated **organiser** propose dates for a get-together, publish a poll behind an unguessable public link, and let anyone with the link (**link holders**, no account) fill in a shared, wiki-like Yes/No availability table. The organiser reviews the complete audit history, undoes changes, picks a final date (which closes the poll), reopens it, edits the location in any state, and regenerates the link.

Functional source of truth: `requirements/user-requirements.md` and `requirements/acceptance-use-cases.md` (US-01 … US-38, written for Playwright). This README describes the **UI** that satisfies them; where they conflict, the requirements win.

## About the design files
The files in this bundle are **design references created in HTML**: a clickable prototype that shows the intended look and behaviour. They are **not production code to copy**. The task is to **recreate this UI in the target codebase's existing environment** (React, Vue, SvelteKit, etc.) using its established patterns, with a real backend. If there is no codebase yet, choose an appropriate stack; for example, a React/Next.js front end with a server that enforces every rule below.

The prototype runs everything in the browser, in memory. It has **no server, auth, persistence or real-time sync**. Everything the acceptance criteria say is "rejected by the server" is only simulated client-side (`guardOpen()`, validators) and **must be enforced server-side** in the real build.

## Fidelity
**High-fidelity for layout, copy, states and flows**, styled with the **Modernist** design system (tokens below). Recreate the layout, hierarchy, copy and interactions faithfully. If the target codebase has its own design system, map these tokens onto it. Otherwise use the tokens here exactly.

`Poll Wireframes.dc.html` holds the low-fi exploration. Turn 2 (options 2a–2d) is the chosen direction: **"1b – ranking-first"**, where the popular-date ranking sits above the answers table.

## Global chrome
- **Prototype bar** (black strip at top): a prototype-only control that switches between organiser and link holder, simulates someone else's edit, adds demo dates and fetches the current link. **Do not build it.**
- **App header**: `padding 14px 24px`, `border-bottom: 2px solid --color-text`.
  - Left: the wordmark "Gather" (Archivo 800, 20px). For the organiser it links to My polls.
  - Right: save status "All changes saved · HH:MM:SS" (12px, `--color-neutral-700`), then the account ("olivia@example.test"), or "No account needed" for link holders.
- **Main column**: `max-width 920px`, centred, `padding 28px 24px 96px`, vertical `gap 20px`. Fluid down to mobile.
- **Toast** (bottom-left, fixed): `--color-text` background, `--color-bg` text, 14px, `padding 12px 16px`, `--shadow-lg`, auto-dismiss after ~3.6s, `role="status"`. Used for confirmations and rejections.
- Section separators are always `border-top: 2px solid --color-text` (Modernist rule). Hairlines inside lists are `1px --color-neutral-300`.
- **Every** label, heading and button label is flush left. No rounded corners anywhere.

## Screens / views

### 1. My polls (organiser dashboard)
- **Purpose:** list the organiser's polls and create a new one.
- **Layout:**
  - Header row with the kicker "ORGANISER" (11px/700, letter-spacing .09em, uppercase, `--color-neutral-700`) above an h1 "My polls" (36px/800).
  - Primary button "New poll" on the right.
- **Table** (`.table`), columns: Title (bold) · State tag · Dates · Responses · "Open →" (`--color-accent-700`, 600). The whole row is clickable.
- **State tags:**
  - Open: `--color-text` background, `--color-bg` text.
  - Closed: `--color-accent` background, `--color-bg` text.
  - Draft: `--color-accent-100` background, `--color-accent-800` text.
- **Navigation:** a draft opens the Editor; open or closed polls open the Poll page.

### 2. Draft editor (US-01 – US-04, US-35)
- **Header:**
  - Tag "Draft · only you can see this" (`.tag-accent`, bold), with an h1 of the title (or "New poll") beneath it.
  - Buttons "Preview" (secondary) and "Publish" (primary).
- **Publish-blocked banner** (after a failed publish attempt; recomputed live until valid):
  - `2px solid --color-accent` border, `--color-accent-100` fill, `--color-accent-900` text, `role="alert"`.
  - Heading "Can't publish yet — fix these first:", then one line per error, prefixed with "— ".
- **Fields** (grid `repeat(auto-fit,minmax(260px,1fr))`, gap 16px, `.field` label + `.input`):
  - **Title \*** (full width).
  - **Description** (full width).
  - **Location** (full width textarea, monospace 13px). Label: "Location — plain text or Markdown, e.g. [map](https://…)". Below it, either a live error (12px/600, `--color-accent-700`) or "Shows as: …" with the safely rendered preview.
  - **Instructions**.
  - **Time zone \*** (select; default Europe/London).
- **Proposed dates** section:
  - Heading "Proposed dates", with the helper text "At least two. Order is kept as the tie-breaker in the ranking."
  - Each row is a grid `28px | 1fr | 120px | auto`: index number (16px/800) · date input · time input · icon buttons ↑ ↓ ✕ (36×36).
  - ↑ is disabled on the first row and ↓ on the last.
  - Row errors show beneath the row, indented 36px. The border turns `--color-accent`. Messages: "Enter a valid date." / "Same as date N — duplicates can't be published."
  - Empty state: dashed box, "No dates yet. Add at least two below."
  - Add row: date + time (default 18:00) + "Add date". A duplicate is **not added** and shows "Sat 17 Oct 18:00 is already proposed — duplicate dates aren't added."
- **Publish validation messages** (exact copy):
  - "Add a title."
  - "Add at least two proposed dates." / "Add at least one more proposed date (minimum two)."
  - "Date N isn't a valid date."
  - "Date N is the same as date M."
  - "Location: …"
- **On success:** state becomes Open, a token is issued, and the Share screen opens.

### 3. Preview (US-05)
- **Banner:** "**Preview** This is what participants will see. Responses are turned off until you publish.", with a "Back to editing" button. Same accent styling as the publish-blocked banner.
- **Body:** title, description, instructions, meta line (Where … · Times in …).
- **Table:** date columns with the message "No responses yet.", and a disabled "+ Add row". The poll stays Draft.

### 4. Share (US-06, US-33)
- **Header:** the original share-screen prototype uses tag "Published · Open", h1 "Share this link", and "Anyone with the link can see and edit every response — no account needed." S-045 now retains the published poll's management heading and controls, with the share-link section below the poll title.
- **Link:** read-only monospace input `https://gather.app/p/<22-char token>` plus a primary "Copy link" button, which reads "Copied ✓" after clicking.
- **Buttons:** "Go to the poll", "Open as a link holder".
- **Link security** section:
  - Copy: "If the link was shared with the wrong people, replace it. The old link stops working immediately. Dates, responses and history are kept."
  - Button "Regenerate link…" opens a confirm dialog.
- **Token:** at least 128 bits of randomness in the real build. Never sequential. Never written to the audit log.

### 5. Poll page — the core screen (US-08 – US-19, US-24 – US-30, US-36)
Order top-to-bottom:

1. **Organiser toolbar** (organiser only):
   - Box: `--color-neutral-100` fill, `2px solid --color-text` border.
   - Contents: label "ORGANISER" · "History (N)" · "Edit location" · "Share link" · (Closed only) primary "Reopen poll…".
   - While Open, a right-aligned hint: "Pick a date below to close the poll".
2. **Title block:** state tag · h1 of the title (40px/800) · description · instructions (`--color-neutral-700`) · meta line `Where <rendered location>` · `Times in <tz>` (14px, bold labels).
3. **Final-date poster** (Closed only):
   - Full-width `--color-accent` field with `--color-bg` text, `padding 24px 22px`.
   - Contents: kicker "IT'S DECIDED" · date in long form (e.g. "Saturday 17 October 2026, 18:00", Archivo 800 44px/1.02) · "3 of 3 can make it".
   - This stays the primary result even if the chosen date isn't ranked #1.
4. **Provisional box** (Open after a reopen): `2px dashed --color-accent` border, `.tag-accent` "Provisional", "The poll was reopened — this date may change.", and the date at 24px/800.
5. **Ranking** section:
   - Heading "Most popular dates", or "Final ranking" when closed.
   - Note, open: "Top N by Yes · ties keep the original order · updates live". Note, closed: "Frozen when the poll closed · read-only".
   - An ordered list (`aria-label="Most popular dates"`), up to 5 items.
   - Each item is a grid `28px | minmax(120px,190px) | 1fr | 64px | auto`:
     - Rank (20px/800).
     - Short date "Sat 17 Oct 18:00", followed by " ★" (in `--color-accent-700`) if it is the final date.
     - Bar: 10px tall on a `--color-neutral-200` track; width = yes / maxYes. Fill is `--color-accent` while open, `--color-neutral-600` when frozen; `transition: width .35s ease`.
     - "N yes".
     - Organiser + Open only: a secondary "Pick…" button.
   - **Ranking rule:** Yes count descending, then original date order. No counts are ignored. Recalculated after every mutation or undo. Snapshotted at close and shown from the snapshot until reopened.
6. **Answers** section:
   - **Collaboration banner** (Open): `--color-accent-100` fill, `1px --color-accent-300` border, `--color-accent-900` text. Copy: "**This is a shared table.** Anyone with the link can add, rename, delete or change any row. Every change saves automatically."
   - **Closed banner:** `--color-neutral-100` fill, `1px --color-neutral-400` border. Copy: "**This poll is closed.** Responses are read-only."
   - **Header row:** h2 "Everyone's answers" · overflow indicator (see below) · primary "+ Add a row" (Open only).
   - **Table** (`.table`):
     - First column: Name, bold, **sticky** (`position: sticky; left: 0; background: --color-bg`).
     - One column per date, `min-width 92px`, `nowrap`. Header shows the short day on line 1 and the time on line 2.
     - Last column (Open only): a ⋯ icon button.
     - Footer row: "Yes total" with Archivo 800 18px counts, `border-top: 2px solid --color-text`.
     - Closed: the final date's column (header, cells and total) is tinted `--color-accent-100`.
   - **Availability cell** (Open): a real `<button>` filling the cell, min 72×38px, `padding 6px 10px`, left-aligned text, `aria-pressed`, and `aria-label` "Alice, Sat 10 Oct 18:00: Yes".
     - **Yes:** `--color-accent-100` fill, `1px --color-accent-300` border, `--color-accent-800` text, weight 700.
     - **No:** `--color-surface` fill, `1px --color-neutral-300` border, `--color-neutral-700` text, weight 500.
     - **Hover:** border becomes `--color-text`.
     - **Focus-visible:** `2px --color-accent` outline, offset 2px.
     - **Live update from someone else:** the border flashes `--color-accent` for ~1.6s.
   - **Cell when Closed:** plain text, no button.
   - **Row menu (⋯):** a dropdown (`2px --color-text` border, `--shadow-md`, min-width 130px) with "Rename…" and "Delete…" (the latter in `--color-accent-700`). Item hover: `--color-accent-100`.
   - **Help text** (Open): "Click a cell to switch between Yes and No, or Tab to it and press Space."
   - **Empty state:** "No one has answered yet."

**Horizontal overflow indicator** (when the date columns exceed the width):
- In the header: "Dates 3–7 of 9" (12px/600), plus ← → icon buttons, each disabled when its side can't scroll.
- Edge affordances (full table height) are clickable and scroll about 80% of the visible date area, with smooth scrolling:
  - **Left:** 56px wide, positioned just after the sticky Name column, gradient from `--color-bg` to transparent. Shows "←" plus "N earlier" (10px/700, `--color-accent-700`).
  - **Right:** 72px wide, gradient, `border-right: 2px solid --color-accent`. Shows "→" plus "N more".
- Once the table is scrolled from the start, the sticky Name column gains `border-right: 2px solid --color-text`.
- **Measurement:**
  - A side is "overflowing" when `scrollLeft > 2` (left) or `scrollWidth − clientWidth − scrollLeft > 2` (right).
  - The counts are columns clipped by more than 6px, with a minimum of 1 on any side that overflows.
  - Re-measure on scroll (plus debounced at 120ms after scrolling stops), on resize and after data changes.

### 6. History (US-20 – US-22)
- "← Back to poll" (ghost button), h1 "History", and the summary "N changes, newest first. Undo adds a new entry — nothing is ever removed."
- **Table** (13px), columns: # · When ("27 Sept, 14:32:10") · Who ("Olivia (organiser)" / "Anonymous link holder") · Change (bold) · Before · After · Undo (ghost button). Undo entries are tinted `--color-accent-100`.
- **Undoable kinds:** cell toggle, rename, row added, row deleted, location change. Lifecycle, date and link entries aren't undoable.
- **Undo rules:**
  - An undo restores the recorded "before" value and appends a new entry "Undo #N: …". The original entry is never altered.
  - If the current value differs from the entry's "after" value (a later change touched it), a confirm dialog explains the overwrite, e.g. "A later change already set Alice · Sat 10 Oct to Yes. Undoing sets it to No and overwrites that newer value."
  - Undo is refused, via toast, when:
    - the target no longer exists
    - the name would clash
    - there is nothing to undo
    - the change is a response and the poll is closed ("Reopen the poll to undo response changes…")
- Never show tokens, session IDs or credentials.

### 7. Invalid link (US-07, US-34)
- Kicker "LINK NOT VALID" (`--color-accent-700`), h1 "This poll link doesn't work", and "The organiser may have replaced it, or the poll isn't published yet. Ask them for the current link. Nothing you do here can change the poll."
- The same page is used for drafts and revoked links, so it discloses nothing. A stale open page that tries to write gets the toast "This link is no longer valid. Nothing was changed."

## Dialogs
Built on `.dialog-backdrop` + `.dialog`: `2px --color-text` border, `--color-bg` fill, `--shadow-lg`, max-width 440px.
- Actions are **left-aligned**: primary action, optional secondary, then a ghost "Cancel".
- Enter submits, Escape and backdrop click cancel.
- Errors show as `role="alert"` text (13px/600, `--color-accent-700`), and the input border turns `--color-accent`. The entered value is **preserved** on error.

| Dialog | Content | Primary |
|---|---|---|
| Add a row | "Display name" input; "Every date starts as No. The row saves as soon as you add it." | Add row |
| Rename "X" | "New name" input prefilled; "Answers stay the same." | Rename |
| Delete X's row? | "Type **X** to confirm. The organiser can undo this from the history." + input. Mismatch: "That doesn't match "X". The row was not deleted." | Delete row |
| Final date | Kicker, long date (26px), two columns "Yes · N" / "No · N" listing names (or "Nobody"), accent warning "Confirming **closes the poll**. Dates and responses become read-only until you reopen it." | Confirm & close poll |
| Reopen this poll? | "People with the link can change responses again. <date> will stay as a provisional pick until you close the poll again." | Reopen poll |
| Location | Monospace textarea; label notes "the poll stays <State>"; live "Shows as:" preview. Secondary "Clear location". | Save location |
| Regenerate the link? | "The current link stops working straight away…" | Regenerate link |
| Undo #N? | Accent-bordered overwrite warning + "The original entries stay in the history. A new "Undo" entry is added." | Overwrite & undo |

## Validation rules (client mirrors server)
- **Participant name:**
  - Trimmed, non-empty, max 40 characters (the prototype's choice; the spec leaves the limit open).
  - Unique case-insensitively.
  - Copy for duplicates: ""Alice" is already in this poll. Names must be unique (capitals don't count)."
- **New rows:** every date defaults to No.
- **Location:**
  - Max 500 characters.
  - Reject any HTML tag ("HTML and scripts aren't allowed…").
  - Markdown links must be `[text](http(s)://…)` with non-empty text; anything else is rejected ("Unsafe link "javascript:…" — only http:// and https:// links are allowed.").
  - Render by parsing into text and link segments; never use `innerHTML`.
  - Links open with `target="_blank" rel="noopener noreferrer"`.
- **Dates:** must be valid. The date + time pair must be unique. Minimum two before publishing.
- **Closed poll:** every participant write is rejected, and date edits are rejected. The organiser can still set, edit or clear the location. Saving it doesn't change the state and is audited.

## State management
**Poll:**
`{ id, title, desc, loc, instr, tz, dates[{id,date,time}], state: 'draft'|'open'|'closed', finalId, provisional, frozen[{dateId,yes}], token, rows[{id,name,ans:{[dateId]:bool}}], audit[], seq }`

**Audit entry:**
`{ id, ts, actor, what, before, after, kind: 'info'|'cell'|'rename'|'addRow'|'delRow'|'loc'|'undo', data }`
- `data` holds the typed payload that undo needs.
- Actor is the organiser (with identity) or "Anonymous link holder".

**Transitions:**
- **Draft → Open:** publish (issues token).
- **Open → Closed:** confirm the final date. Snapshot the ranking into `frozen`, set `finalId`, `provisional=false`.
- **Closed → Open:** confirm reopen. Set `provisional=true`, clear `frozen`, keep `finalId`.
- Every successful change appends exactly one audit entry. Rejected changes append nothing.

**Real-build requirements the prototype only simulates:**
- Every add, rename, delete or toggle is sent to the server immediately (no Save button).
- Last update wins, with no conflict warning.
- Push newer state to all open clients (SSE/WebSocket or polling) and always re-render from server state.
- Server-side authorisation for every organiser-only operation, including ownership checks against other organisers (US-31, US-32, US-38).

## Design tokens (Modernist — `_ds/…/styles.css`)
**Colours:**
- **Base:** `--color-bg #f3f2f2` · `--color-surface #eae9e9` · `--color-text #201e1d` · `--color-accent #ec3013` · `--color-divider = #201e1d @ 40%`
- **Neutral ramp:**
  - 100 `#f8f4f4`, 200 `#eae7e7`, 300 `#d7d3d3`
  - 400 `#bab6b6`, 500 `#9b9797`, 600 `#7d7979`
  - 700 `#605d5d`, 800 `#444141`, 900 `#2d2b2b`
- **Accent ramp:**
  - 100 `#fff2ef`, 200 `#ffe0d9`, 300 `#ffc4b8`
  - 400 `#ff9783`, 500 `#ff563c`, 600 `#dd2b0f`
  - 700 `#ae1800`, 800 `#7c1405`, 900 `#4d170e`
- For body-size text in the accent, use `--color-accent-700`, not the base accent.

**Type:**
- Archivo (Google Fonts, weights 400/600/800) for everything. Headings use weight 800, line-height 1.12, letter-spacing −0.015em. Body is 15px/1.55.
- Sizes in use: h1 36–40px, h2 20px, body 14–15px, meta 12–13px, kickers 10.5–11px uppercase with 0.09–0.1em letter-spacing.

**Spacing:** 4 / 8 / 12 / 16 / 24 / 32px (`--space-1..8`).

**Radius:** 0 everywhere.

**Shadows:**
- sm `0 1px 2px #2d2b2b@14%`
- md `0 3px 10px #2d2b2b@16%`
- lg `0 12px 32px #2d2b2b@22%`

**Components:**
- `.btn` (14px/800), `.btn-primary` (accent fill, hover `-600`, active `-700`), `.btn-secondary` (divider border, hover 7% ink tint), `.btn-ghost` (accent text), `.btn-icon` (36×36).
- `.input` (min-height 36px, 1px divider border, focus border accent).
- `.table` (th 11px uppercase, 2px bottom rule; td 1px divider rule).
- `.tag`, `.dialog`.
- Focus: `:focus-visible { outline: 2px solid accent; outline-offset: 2px }`. Disabled: 45% opacity.

## Assets
- No images.
- Glyph icons in the prototype (↑ ↓ ✕ ⋯ ← → ★) should become **Lucide** icons in production, per the design system: `arrow-up`, `arrow-down`, `x`, `more-horizontal`, `chevron-left`, `chevron-right`, `star`.
- Font: Archivo, loaded via Google Fonts.

## Files
- `Gather Prototype.dc.html` — **the reference prototype.** The template markup plus a `class Component` holding all behaviour: validators, ranking, undo, overflow measurement. Open it in a browser next to `support.js` and `_ds/`. Use the black prototype bar to switch roles.
- `Gather Prototype (standalone, for viewing only).html` — the same prototype bundled offline. Its contents are encoded, so read the `.dc.html` source instead.
- `Poll Wireframes.dc.html` — low-fi exploration. Turn 2 = the chosen layout; turn 1 = all screens and alternatives, annotated with US numbers.
- `requirements/user-requirements.md`, `requirements/acceptance-use-cases.md` — the functional spec and the acceptance tests.
- `_ds/…/styles.css`, `_ds_bundle.js`, `support.js` — needed only to run the prototype.
