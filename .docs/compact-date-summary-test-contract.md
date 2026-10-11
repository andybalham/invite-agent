# Compact date summaries: T-153 test contract

This specifies the failing-first stage of S-058 using the [My polls improvement design](26-10-11-my-polls-improvements.md). T-154 supplies the implementation; T-155 supplies real browser/API responsive acceptance. These tests use the existing in-memory Vite/browser component harness with intercepted transport and no live services.

Presentation decisions within the design's suggested ranges:

- Show `No dates proposed` and `0 proposed dates` for zero dates. Show a singular/plural proposed-date count for every nonempty result.
- Preview the first three saved choices. One to three dates need no disclosure. Four through eight dates use an inline labelled region. Nine or more use a labelled modal dialog. These limits never truncate API data.
- Use native `Show dates` / `Hide dates` buttons for inline expansion. The dialog trigger is `Show dates`; its expanded state tracks whether the dialog is open. Every trigger has `aria-expanded` and `aria-controls`, with unique content IDs across siblings and the simultaneously rendered desktop/mobile variants.
- Collapsed full content is hidden from the accessibility tree. Expanded full lists contain every saved choice exactly once in saved order. Preview labels may remain outside the full list.
- Enter and Space activate the controls. Inline toggling retains focus on the button. A dialog moves focus inside, contains forward/backward Tab navigation, offers a labelled close button, supports Escape, and restores focus to the initiating control after either dismissal, including repeat opens.
- Preserve the existing en-GB short weekday/day/month/year labels. Date-only choices have no time or zone conversion. Timed choices include saved local time, poll IANA zone and UTC offset, including both occurrences of a repeated DST hour. Test viewer zones on both sides of UTC.
- Closed summaries show visible `Final date: <existing date label>` even when the chosen date is beyond the preview. Reopened selections must not be called final.

The existing owned-list DTO has no selection field and its dates have no IDs. The unit contracts specify an optional safe `finalDate` choice for closed summaries, resolved from the persisted selected choice, with no internal ID or capability fields. It must be a saved choice and detached from both stored data and the summary list. The component fixture scripts that future DTO explicitly; it does not silently add selection data to the existing shared navigation fixture. Legacy summaries without this field remain accepted; the implementation must handle their absence without inventing a final choice.

Coverage lives in `test/foundation/compact-date-summary.test.mjs` and `test/component/my-polls-compact-dates.test.mjs`, with explicit expected labels in `test/support/compact-date-fixture.mjs`. Boundary counts are 0, 1, 3, 4, 8, 9 and 20. Both desktop table and mobile card paths are exercised, including independent sibling disclosures. Disclosure requests must not fetch details/share links or mutate polls.

Run from the repository root:

```powershell
npm run build
node --test test/foundation/compact-date-summary.test.mjs
node --test test/component/my-polls-compact-dates.test.mjs
```

The projection preservation and existing no-date behavior serve as controls; new final-date DTO, counts, compact output and disclosure assertions are expected to fail before T-154. Existing summary tests still describe the full-list renderer; T-154 should update their default-visibility assumptions while retaining order/formatting and lifecycle assertions. T-153 does not claim CSS overflow/touch-target or live API/database acceptance; those remain T-155 work.
