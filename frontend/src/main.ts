import "./styles.css";
import type { OwnedPollListResponse } from "@invite-a-gent/contracts";
import {
  createPollDestination, myPollsContext, myPollsDestination, organiserPollDestination,
  ownedPollDestination, pollReturnContext
} from "./organiser-navigation.js";

type ProposedDate =
  | { kind: "date"; localDate: string }
  | {
      kind: "date-time";
      localDateTime: string;
      utcOffset?: string;
      utcInstant?: string;
      timeZone?: string;
    };

interface PollDetails {
  id: string;
  title: string;
  status: "draft" | "open" | "closed";
  version: number;
  timeZone: string;
  proposedDates: ProposedDate[];
  description?: string;
  instructions?: string;
  location?: string;
}

interface PublicPollDetails extends PollDetails {
  participants: Array<{
    id: string;
    displayName: string;
    availability: Record<string, "yes" | "no">;
  }>;
  proposedDates: Array<ProposedDate & { id: string }>;
  ranking: Array<{
    choiceId: string;
    yesTotal: number;
  }>;
  selectedDateId?: string;
  provisional?: true;
}

interface AuditHistoryEvent {
  id: string;
  revision: number;
  entity: { type: "poll" | "date" | "participant" | "availability"; id: string };
  action: string;
  summary: string;
  before: unknown;
  after: unknown;
  occurredAt: string;
  actor: { category: "organiser" | "anonymous-link-holder"; subject?: string };
  undoOf?: { id: string; revision: number };
}

interface UndoPreview {
  eventId: string;
  revision: number;
  summary: string;
  restoredBefore: unknown;
  restoredAfter: unknown;
  wouldOverwrite: boolean;
  warning?: string;
}

interface AuditHistoryPage {
  items: AuditHistoryEvent[];
  total: number;
  nextCursor?: string;
}

const app = document.querySelector<HTMLElement>("#app");
if (!app) throw new Error("Application root is missing");
app.className = "app-main";

app.innerHTML = `
  <header class="app-header">
    <div class="app-header__inner">
      <a class="wordmark" href="/" aria-label="Gather home">Gather</a>
      <div class="app-header__meta">
        <span data-testid="header-save-status">All changes saved · --:--:--</span>
        <span class="account">olivia@example.test</span>
        <span class="sr-only" data-testid="api-health" aria-live="polite">Checking API…</span>
      </div>
    </div>
  </header>
  <main class="my-polls" hidden aria-labelledby="my-polls-heading">
    <div class="editor__header">
      <div><p class="kicker">ORGANISER</p><h1 id="my-polls-heading">My polls</h1></div>
      <a class="btn btn-primary create-poll" href="#">Create poll</a>
    </div>
    <div class="my-polls-filters" role="group" aria-label="Poll lifecycle">
      <button class="btn btn-secondary" type="button" data-filter="active" aria-pressed="true">Active</button>
      <button class="btn btn-secondary" type="button" data-filter="draft" aria-pressed="false">Draft</button>
      <button class="btn btn-secondary" type="button" data-filter="open" aria-pressed="false">Open</button>
      <button class="btn btn-secondary" type="button" data-filter="closed" aria-pressed="false">Closed</button>
    </div>
    <p class="my-polls-status" role="status" aria-live="polite"></p>
    <p class="my-polls-error error" role="alert" hidden></p>
    <div class="my-polls-list" aria-label="Owned polls"></div>
  </main>
  <section class="editor" hidden aria-labelledby="draft-heading">
      <a class="btn btn-ghost my-polls-return" href="#">← My polls</a>
      <div class="editor__header">
        <div>
          <p class="tag tag-accent">Draft · only you can see this</p>
          <h1 id="draft-heading">New poll</h1>
        </div>
        <div class="editor__header-actions">
          <button class="btn btn-secondary preview-button" type="button" disabled>Preview</button>
          <button class="btn btn-primary publish-button" type="button" disabled>Publish</button>
        </div>
      </div>
      <div class="alert publish-readiness" role="alert"><strong>Can't publish yet — fix these first:</strong><ul></ul></div>
      <div class="section-rule">
        <h2>Poll details</h2>
        <p>Give people the context they need before you add proposed dates.</p>
      </div>
      <form class="editor-form" data-testid="draft-form" novalidate>
        <div class="field field--wide"><label for="title">Title <b aria-hidden="true">*</b></label><input class="input" id="title" name="title" required autocomplete="off" placeholder="Autumn get-together"></div>
        <div class="field field--wide"><label for="description">Description</label><textarea class="input" id="description" name="description" rows="3" placeholder="What are you planning?"></textarea></div>
        <div class="field field--wide"><label for="location">Location — plain text or Markdown, e.g. [map](https://…)</label><textarea class="input input--code" id="location" name="location" rows="5" spellcheck="true" placeholder="Community Hall — [map](https://…)"></textarea><div class="field__meta"><span data-testid="location-count">0 / 4,000</span></div><div class="location-preview"><span>Shows as:</span><div class="markdown" data-testid="location-preview"><p class="empty">Your safe location preview appears here.</p></div></div></div>
        <div class="field"><label for="instructions">Instructions</label><textarea class="input" id="instructions" name="instructions" rows="4" placeholder="Please reply by Friday."></textarea></div>
        <div class="field"><label for="timeZone">Time zone <b aria-hidden="true">*</b></label><select class="input" id="timeZone" name="timeZone"><option value="Europe/London">Europe/London</option><option value="Europe/Paris">Europe/Paris</option><option value="America/New_York">America/New_York</option><option value="Asia/Tokyo">Asia/Tokyo</option></select></div>
        <section class="choices field--wide" aria-labelledby="choices-heading">
          <div class="section-rule">
            <div><h2 id="choices-heading">Proposed dates</h2><p>At least two. Order is kept as the tie-breaker in the ranking.</p></div>
          </div>
          <div class="choice-list" data-testid="choice-list"></div>
          <div class="choice-add">
            <div class="field"><label for="new-date">New proposed date</label><input class="input" id="new-date" type="date"></div>
            <div class="field"><label for="new-time">New proposed time</label><input class="input" id="new-time" type="time" value="18:00"></div>
            <div class="field offset-field" hidden><label for="new-offset">Choose UTC offset</label><select class="input" id="new-offset"></select></div>
            <button class="btn btn-secondary add-date" type="button">Add date</button>
          </div>
        </section>
        <div class="saved-card field--wide" hidden data-testid="saved-card"><span>Last saved location</span><div class="markdown" data-testid="saved-location"></div></div>
        <div class="form-message field--wide"><p class="alert error" role="alert" hidden></p><p class="save-status" role="status" aria-live="polite"></p></div>
        <div class="actions field--wide"><p>Required fields are marked <b>*</b></p><button class="btn btn-primary save-button" type="submit">Save draft</button></div>
      </form>
  </section>
  <section class="poll-preview" hidden aria-labelledby="preview-heading">
    <div class="alert preview-banner"><div><strong>Preview</strong> This is what participants will see. Responses are turned off until you publish.</div><button class="btn btn-secondary back-to-editor" type="button">Back to editing</button></div>
    <div class="preview-title"><p class="tag tag-accent">Draft · preview only</p><h1 id="preview-heading"></h1><p data-testid="preview-description"></p><p data-testid="preview-instructions"></p><p class="preview-meta"></p></div>
    <div class="preview-table-wrap"><table class="table preview-table"><thead><tr><th>Name</th></tr></thead><tbody><tr><td>No responses yet.</td></tr></tbody></table></div>
    <button class="btn btn-primary" type="button" disabled>+ Add row</button>
  </section>
  <section class="share-screen" hidden aria-labelledby="share-heading">
    <div class="share-title">
      <p class="tag tag-open">Published · Open</p>
      <h1 id="share-heading" tabindex="-1">Share this link</h1>
      <p>Anyone with the link can see and edit every response — no account needed.</p>
    </div>
    <div class="share-link">
      <label for="public-link">Public poll link</label>
      <div><input class="input input--code" id="public-link" readonly><button class="btn btn-primary copy-link" type="button">Copy link</button></div>
    </div>
    <div class="share-actions">
      <a class="btn btn-primary go-to-poll" href="#">Go to the poll</a>
      <a class="btn btn-secondary open-public-link" href="#" target="_blank" rel="noopener noreferrer">Open as a link holder</a>
      <a class="btn btn-secondary open-history" href="#">History</a>
    </div>
    <section class="link-security section-rule">
      <div><h2>Link security</h2><p>If the link was shared with the wrong people, replace it. The old link stops working immediately. Dates, responses and history are kept.</p></div>
      <button class="btn btn-secondary" type="button" disabled>Regenerate link…</button>
    </section>
    <p class="share-status" role="status" aria-live="polite"></p>
  </section>
  <main class="history-screen" hidden aria-labelledby="history-heading">
    <a class="btn btn-ghost history-back" href="#">← Back to poll</a>
    <div class="history-title">
      <p class="kicker">ORGANISER</p>
      <h1 id="history-heading" tabindex="-1">History</h1>
      <p class="history-summary" aria-live="polite"></p>
    </div>
    <div class="history-table-wrap">
      <table class="table history-table" aria-label="Poll history">
        <thead><tr><th>#</th><th>When</th><th>Who</th><th>Change</th><th>Before</th><th>After</th><th>Undo</th></tr></thead>
        <tbody></tbody>
      </table>
    </div>
    <button class="btn btn-secondary history-more" type="button" hidden>Load older changes</button>
    <p class="history-error error" role="alert" hidden></p>
    <p class="history-status" role="status" aria-live="polite"></p>
  </main>
  <main class="invalid-link history-access-denied" hidden aria-labelledby="history-access-heading">
    <p class="invalid-kicker">ACCESS DENIED</p>
    <h1 id="history-access-heading" tabindex="-1">History isn’t available</h1>
    <p>Sign in as the poll organiser to view history and undo changes.</p>
  </main>
  <main class="public-poll" hidden aria-labelledby="public-poll-heading">
    <section class="organiser-toolbar" hidden aria-label="Organiser controls">
      <strong class="kicker">ORGANISER</strong>
      <a class="btn btn-ghost my-polls-return" href="#">← My polls</a>
      <a class="btn btn-secondary poll-history" href="#">History</a>
      <button class="btn btn-secondary edit-location" type="button">Edit location</button>
      <button class="btn btn-primary reopen-poll" type="button" hidden>Reopen poll…</button>
      <span class="organiser-close-hint">Pick a date below to close the poll</span>
    </section>
    <section class="public-title">
      <p class="tag tag-open" data-testid="public-state">Open</p>
      <h1 id="public-poll-heading" tabindex="-1"></h1>
      <p data-testid="public-description"></p>
      <p data-testid="public-instructions"></p>
      <div class="public-meta"><span class="public-location"></span><strong class="public-time-zone"></strong></div>
    </section>
    <section class="final-date-poster" hidden aria-labelledby="final-date-heading">
      <p class="kicker">IT'S DECIDED</p>
      <h2 id="final-date-heading"></h2>
      <p class="final-date-summary"></p>
    </section>
    <section class="provisional-selection" hidden aria-label="Provisional selection">
      <div><span class="tag tag-accent">Provisional</span><span>The poll was reopened — this date may change.</span></div>
      <p class="provisional-date"></p>
    </section>
    <section class="ranking" aria-labelledby="ranking-heading">
      <div class="ranking__header">
        <h2 id="ranking-heading">Most popular dates</h2>
        <p class="ranking__note">Top 5 by Yes · ties keep the original order · updates live</p>
      </div>
      <ol class="ranking__list" aria-label="Most popular dates"></ol>
    </section>
    <section class="answers" aria-labelledby="answers-heading">
      <div class="collaboration-notice"><strong>This is a shared table.</strong> Anyone with the link can add, rename, delete or change any row. Every change saves automatically.</div>
      <div class="closed-notice" hidden><strong>This poll is closed.</strong> Responses are read-only.</div>
      <div class="section-rule"><h2 id="answers-heading">Everyone's answers</h2><button class="btn btn-primary add-participant" type="button">+ Add a row</button></div>
      <div class="public-table-wrap"><table class="table public-table"><thead><tr><th>Name</th></tr></thead><tbody><tr><td>No one has answered yet.</td></tr></tbody><tfoot><tr><th>Yes total</th></tr></tfoot></table></div>
      <p class="table-help">Click a cell to switch between Yes and No, or Tab to it and press Space.</p>
    </section>
  </main>
  <dialog class="dialog location-dialog">
    <form method="dialog" class="dialog-form" novalidate>
      <h2 id="location-dialog-heading">Location</h2>
      <p id="location-state-note" class="location-state-note"></p>
      <div class="field"><label for="location-details">Plain text or Markdown links</label><textarea class="input input--code" id="location-details" rows="4" aria-describedby="location-state-note location-dialog-error"></textarea></div>
      <div class="location-preview"><span>Shows as:</span><div class="markdown location-dialog-preview"></div></div>
      <p id="location-dialog-error" class="dialog-error location-dialog-error" role="alert" hidden></p>
      <div class="dialog-actions"><button class="btn btn-primary location-save" type="submit">Save location</button><button class="btn btn-secondary location-clear" type="button">Clear location</button><button class="btn btn-ghost location-cancel" type="button">Cancel</button></div>
    </form>
  </dialog>
  <dialog class="dialog participant-dialog" aria-labelledby="participant-dialog-heading">
    <form method="dialog" class="dialog-form" novalidate>
      <h2 id="participant-dialog-heading">Add a row</h2>
      <p class="participant-dialog-copy">Every date starts as No. The row saves as soon as you add it.</p>
      <div class="field"><label class="participant-input-label" for="participant-name">Display name</label><input class="input" id="participant-name" autocomplete="off" maxlength="100"></div>
      <p class="dialog-error" role="alert" hidden></p>
      <div class="dialog-actions"><button class="btn btn-primary participant-submit" type="submit">Add row</button><button class="btn btn-ghost participant-cancel" type="button">Cancel</button></div>
    </form>
  </dialog>
  <dialog class="dialog close-dialog" aria-labelledby="close-dialog-heading">
    <form method="dialog" class="dialog-form">
      <p class="kicker">FINAL DATE</p>
      <h2 id="close-dialog-heading">Final date</h2>
      <p class="close-dialog-date"></p>
      <div class="close-attendance">
        <section><h3 class="close-yes-heading"></h3><ul class="close-yes-list"></ul></section>
        <section><h3 class="close-no-heading"></h3><ul class="close-no-list"></ul></section>
      </div>
      <p class="alert close-warning">Confirming <strong>closes the poll</strong>. Dates and responses become read-only until you reopen it.</p>
      <p class="dialog-error close-dialog-error" role="alert" hidden></p>
      <div class="dialog-actions"><button class="btn btn-primary close-confirm" type="submit">Confirm &amp; close poll</button><button class="btn btn-ghost close-cancel" type="button">Cancel</button></div>
    </form>
  </dialog>
  <dialog class="dialog reopen-dialog" aria-labelledby="reopen-dialog-heading">
    <form method="dialog" class="dialog-form">
      <h2 id="reopen-dialog-heading">Reopen this poll?</h2>
      <p>People with the link can change responses again. <span class="reopen-note"></span></p>
      <p class="dialog-error reopen-dialog-error" role="alert" hidden></p>
      <div class="dialog-actions"><button class="btn btn-primary reopen-confirm" type="submit">Reopen poll</button><button class="btn btn-ghost reopen-cancel" type="button">Cancel</button></div>
    </form>
  </dialog>
  <dialog class="dialog undo-dialog" aria-labelledby="undo-dialog-heading">
    <form method="dialog" class="dialog-form">
      <h2 id="undo-dialog-heading">Undo change?</h2>
      <p class="undo-dialog-warning" role="alert" hidden></p>
      <p class="undo-dialog-summary"></p>
      <p>The original entry stays in the history. A new Undo entry is added.</p>
      <p class="dialog-error undo-dialog-error" role="alert" hidden></p>
      <div class="dialog-actions"><button class="btn btn-primary undo-confirm" type="submit">Undo change</button><button class="btn btn-ghost undo-cancel" type="button">Cancel</button></div>
    </form>
  </dialog>
  <main class="invalid-link public-invalid-link" hidden aria-labelledby="invalid-link-heading">
    <p class="invalid-kicker">LINK NOT VALID</p>
    <h1 id="invalid-link-heading" tabindex="-1">This poll link doesn't work</h1>
    <p>The organiser may have replaced it, or the poll isn't published yet. Ask them for the current link. Nothing you do here can change the poll.</p>
  </main>
  <div class="toast public-toast" role="status" aria-live="polite" hidden></div>`;

function requireElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing required element: ${selector}`);
  return element;
}

const form = requireElement<HTMLFormElement>("form");
const title = requireElement<HTMLInputElement>("#title");
const description = requireElement<HTMLTextAreaElement>("#description");
const locationField = requireElement<HTMLTextAreaElement>("#location");
const instructions = requireElement<HTMLTextAreaElement>("#instructions");
const timeZone = requireElement<HTMLSelectElement>("#timeZone");
const choiceList = requireElement<HTMLElement>("[data-testid='choice-list']");
const newDate = requireElement<HTMLInputElement>("#new-date");
const newTime = requireElement<HTMLInputElement>("#new-time");
const offsetField = requireElement<HTMLElement>(".offset-field");
const newOffset = requireElement<HTMLSelectElement>("#new-offset");
const addDateButton = requireElement<HTMLButtonElement>(".add-date");
const previewButton = requireElement<HTMLButtonElement>(".preview-button");
const publishButton = requireElement<HTMLButtonElement>(".publish-button");
const readinessBanner = requireElement<HTMLElement>(".publish-readiness");
const readinessList = requireElement<HTMLUListElement>(".publish-readiness ul");
const editor = requireElement<HTMLElement>(".editor");
const previewScreen = requireElement<HTMLElement>(".poll-preview");
const previewHeading = requireElement<HTMLElement>("#preview-heading");
const previewDescription = requireElement<HTMLElement>("[data-testid='preview-description']");
const previewInstructions = requireElement<HTMLElement>("[data-testid='preview-instructions']");
const previewMeta = requireElement<HTMLElement>(".preview-meta");
const previewTableHead = requireElement<HTMLTableRowElement>(".preview-table thead tr");
const previewTableBodyRow = requireElement<HTMLTableRowElement>(".preview-table tbody tr");
const backToEditor = requireElement<HTMLButtonElement>(".back-to-editor");
const locationCount = requireElement<HTMLElement>("[data-testid='location-count']");
const preview = requireElement<HTMLElement>("[data-testid='location-preview']");
const savedCard = requireElement<HTMLElement>("[data-testid='saved-card']");
const savedLocation = requireElement<HTMLElement>("[data-testid='saved-location']");
const errorMessage = requireElement<HTMLElement>(".form-message [role='alert']");
const saveStatus = requireElement<HTMLElement>(".save-status");
const saveButton = requireElement<HTMLButtonElement>(".save-button");
const health = requireElement<HTMLElement>("[data-testid='api-health']");
const heading = requireElement<HTMLElement>("#draft-heading");
const headerSaveStatus = requireElement<HTMLElement>("[data-testid='header-save-status']");
const shareScreen = requireElement<HTMLElement>(".share-screen");
const publicLink = requireElement<HTMLInputElement>("#public-link");
const copyLinkButton = requireElement<HTMLButtonElement>(".copy-link");
const goToPoll = requireElement<HTMLAnchorElement>(".go-to-poll");
const openPublicLink = requireElement<HTMLAnchorElement>(".open-public-link");
const openHistory = requireElement<HTMLAnchorElement>(".open-history");
const shareStatus = requireElement<HTMLElement>(".share-status");
const historyScreen = requireElement<HTMLElement>(".history-screen");
const historyHeading = requireElement<HTMLElement>("#history-heading");
const historyBack = requireElement<HTMLAnchorElement>(".history-back");
const historySummary = requireElement<HTMLElement>(".history-summary");
const historyBody = requireElement<HTMLTableSectionElement>(".history-table tbody");
const historyMore = requireElement<HTMLButtonElement>(".history-more");
const historyError = requireElement<HTMLElement>(".history-error");
const historyStatus = requireElement<HTMLElement>(".history-status");
const historyAccessDenied = requireElement<HTMLElement>(".history-access-denied");
const historyAccessHeading = requireElement<HTMLElement>("#history-access-heading");
const undoDialog = requireElement<HTMLDialogElement>(".undo-dialog");
const undoDialogHeading = requireElement<HTMLElement>("#undo-dialog-heading");
const undoDialogSummary = requireElement<HTMLElement>(".undo-dialog-summary");
const undoDialogWarning = requireElement<HTMLElement>(".undo-dialog-warning");
const undoDialogError = requireElement<HTMLElement>(".undo-dialog-error");
const undoConfirm = requireElement<HTMLButtonElement>(".undo-confirm");
const undoCancel = requireElement<HTMLButtonElement>(".undo-cancel");
const publicPollScreen = requireElement<HTMLElement>(".public-poll");
const publicPollHeading = requireElement<HTMLElement>("#public-poll-heading");
const publicDescription = requireElement<HTMLElement>("[data-testid='public-description']");
const publicInstructions = requireElement<HTMLElement>("[data-testid='public-instructions']");
const publicLocation = requireElement<HTMLElement>(".public-location");
const publicTimeZone = requireElement<HTMLElement>(".public-time-zone");
const publicState = requireElement<HTMLElement>("[data-testid='public-state']");
const organiserToolbar = requireElement<HTMLElement>(".organiser-toolbar");
const locationDialog = requireElement<HTMLDialogElement>(".location-dialog");
const locationDialogField = requireElement<HTMLTextAreaElement>("#location-details");
const locationDialogPreview = requireElement<HTMLElement>(".location-dialog-preview");
const locationDialogError = requireElement<HTMLElement>(".location-dialog-error");
const locationSave = requireElement<HTMLButtonElement>(".location-save");
const locationClear = requireElement<HTMLButtonElement>(".location-clear");
const finalDatePoster = requireElement<HTMLElement>(".final-date-poster");
const finalDateHeading = requireElement<HTMLElement>("#final-date-heading");
const finalDateSummary = requireElement<HTMLElement>(".final-date-summary");
const rankingHeading = requireElement<HTMLElement>("#ranking-heading");
const rankingNote = requireElement<HTMLElement>(".ranking__note");
const rankingList = requireElement<HTMLOListElement>(".ranking__list");
const publicTableHead = requireElement<HTMLTableRowElement>(".public-table thead tr");
const publicTableBody = requireElement<HTMLTableSectionElement>(".public-table tbody");
const publicTableFoot = requireElement<HTMLTableRowElement>(".public-table tfoot tr");
const addParticipantButton = requireElement<HTMLButtonElement>(".add-participant");
const collaborationNotice = requireElement<HTMLElement>(".collaboration-notice");
const closedNotice = requireElement<HTMLElement>(".closed-notice");
const tableHelp = requireElement<HTMLElement>(".table-help");
const participantDialog = requireElement<HTMLDialogElement>(".participant-dialog");
const participantForm = requireElement<HTMLFormElement>(".participant-dialog form");
const participantDialogHeading = requireElement<HTMLElement>("#participant-dialog-heading");
const participantDialogCopy = requireElement<HTMLElement>(".participant-dialog-copy");
const participantInputLabel = requireElement<HTMLLabelElement>(".participant-input-label");
const participantName = requireElement<HTMLInputElement>("#participant-name");
const participantDialogError = requireElement<HTMLElement>(".participant-dialog .dialog-error");
const participantSubmit = requireElement<HTMLButtonElement>(".participant-submit");
const participantCancel = requireElement<HTMLButtonElement>(".participant-cancel");
const closeDialog = requireElement<HTMLDialogElement>(".close-dialog");
const closeDialogDate = requireElement<HTMLElement>(".close-dialog-date");
const closeYesHeading = requireElement<HTMLElement>(".close-yes-heading");
const closeNoHeading = requireElement<HTMLElement>(".close-no-heading");
const closeYesList = requireElement<HTMLUListElement>(".close-yes-list");
const closeNoList = requireElement<HTMLUListElement>(".close-no-list");
const closeDialogError = requireElement<HTMLElement>(".close-dialog-error");
const closeConfirm = requireElement<HTMLButtonElement>(".close-confirm");
const closeCancel = requireElement<HTMLButtonElement>(".close-cancel");
const reopenButton = requireElement<HTMLButtonElement>(".reopen-poll");
const reopenDialog = requireElement<HTMLDialogElement>(".reopen-dialog");
const reopenConfirm = requireElement<HTMLButtonElement>(".reopen-confirm");
const reopenError = requireElement<HTMLElement>(".reopen-dialog-error");
const provisionalSelection = requireElement<HTMLElement>(".provisional-selection");
const publicToast = requireElement<HTMLElement>(".public-toast");
const invalidLinkScreen = requireElement<HTMLElement>(".public-invalid-link");
const invalidLinkHeading = requireElement<HTMLElement>("#invalid-link-heading");
const url = new URL(window.location.href);
const organiserView = url.searchParams.get("organiser") === "1";
const testRunId = url.searchParams.get("testRunId") ?? "browser";
const organiserId = `local-organiser-${testRunId.toLowerCase().replace(/[^a-z0-9-]/g, "-")}`;
let pollId = url.searchParams.get("pollId");
const historyView = url.searchParams.get("view") === "history";
const creationView = url.searchParams.get("view") === "create";
const myPollsScreen = requireElement<HTMLElement>(".my-polls");
const myPollsList = requireElement<HTMLElement>(".my-polls-list");
const myPollsStatus = requireElement<HTMLElement>(".my-polls-status");
const myPollsError = requireElement<HTMLElement>(".my-polls-error");
requireElement<HTMLAnchorElement>(".create-poll").href = createPollDestination(testRunId);
requireElement<HTMLAnchorElement>(".wordmark").href = myPollsDestination(testRunId);
for (const link of document.querySelectorAll<HTMLAnchorElement>(".my-polls-return")) {
  link.href = myPollsDestination(testRunId, pollReturnContext(url.searchParams));
}
let ownedListRequest = 0;
let proposedDates: ProposedDate[] = [];
let publicToken: string | undefined;
let displayedPublicPoll: PublicPollDetails | undefined;
let ownerControlsAllowed = false;
let participantDialogMode: "add" | "rename" | "delete" = "add";
let selectedParticipantId: string | undefined;
let publicRefreshInFlight = false;
let selectedUndoEventId: string | undefined;

function codePointLength(value: string): number { return Array.from(value).length; }

function locationError(value: string): string | undefined {
  if (codePointLength(value) > 4_000) return "Enter location details using 4,000 characters or fewer.";
  if (/<\/?[a-z!][^>]*>/i.test(value)) return "Raw HTML and executable content are not allowed.";
  if (/^(?:#{1,6}\s|>\s|```|~~~)/m.test(value) || value.includes("`") || value.includes("![")) return "Use paragraphs, lists, emphasis, and secure HTTPS links only.";
  for (const match of value.matchAll(/\[[^\]]*\]\(([^)]*)\)/g)) {
    try {
      const target = new URL(match[1] ?? "");
      if (target.protocol !== "https:" || target.username || target.password) return "Only secure HTTPS links are allowed in location details.";
    } catch { return "Only secure HTTPS links are allowed in location details."; }
  }
  if (/[\[\]]/.test(value.replace(/\[[^\]]+\]\([^)]+\)/g, ""))) return "Use valid Markdown links such as [map](https://example.test/map).";
  return undefined;
}

function appendInline(parent: Node, value: string): void {
  let cursor = 0;
  const pattern = /(\*\*([^*]+)\*\*|\*([^*]+)\*|\[([^\]]+)\]\((https:\/\/[^)]+)\))/g;
  for (const match of value.matchAll(pattern)) {
    const index = match.index ?? 0;
    parent.appendChild(document.createTextNode(value.slice(cursor, index)));
    if (match[2]) {
      const strong = document.createElement("strong"); appendInline(strong, match[2]); parent.appendChild(strong);
    } else if (match[3]) {
      const emphasis = document.createElement("em"); appendInline(emphasis, match[3]); parent.appendChild(emphasis);
    } else {
      const anchor = document.createElement("a"); anchor.textContent = match[4] ?? ""; anchor.href = match[5] ?? ""; anchor.target = "_blank"; anchor.rel = "noopener noreferrer"; parent.appendChild(anchor);
    }
    cursor = index + match[0].length;
  }
  parent.appendChild(document.createTextNode(value.slice(cursor)));
}

function renderLocation(container: HTMLElement, value: string): void {
  container.replaceChildren();
  if (!value) {
    const empty = document.createElement("p"); empty.className = "empty"; empty.textContent = "Your safe location preview appears here."; container.append(empty); return;
  }
  let list: HTMLOListElement | HTMLUListElement | undefined;
  for (const line of value.split(/\r?\n/)) {
    const unordered = /^(?:[-+*])\s+(.+)$/.exec(line);
    const ordered = /^\d+\.\s+(.+)$/.exec(line);
    if (unordered || ordered) {
      const tag = unordered ? "UL" : "OL";
      if (!list || list.tagName !== tag) { list = document.createElement(unordered ? "ul" : "ol"); container.append(list); }
      const item = document.createElement("li"); appendInline(item, (unordered?.[1] ?? ordered?.[1]) as string); list.append(item); continue;
    }
    list = undefined;
    if (!line.trim()) continue;
    const paragraph = document.createElement("p"); appendInline(paragraph, line); container.append(paragraph);
  }
}

function updatePreview(): void {
  const value = locationField.value;
  locationCount.textContent = `${codePointLength(value).toLocaleString()} / 4,000`;
  const issue = locationError(value);
  preview.classList.toggle("preview-card--invalid", Boolean(issue));
  if (issue) {
    preview.replaceChildren(); const note = document.createElement("p"); note.className = "empty"; note.textContent = "Preview paused until the location is safe."; preview.append(note);
  } else renderLocation(preview, value);
}

function showSaved(poll: PollDetails): void {
  const value = poll.location ?? "";
  savedCard.hidden = value.length === 0;
  renderLocation(savedLocation, value);
}

function editableChoice(choice: ProposedDate): ProposedDate {
  return choice.kind === "date"
    ? { kind: "date", localDate: choice.localDate }
    : {
        kind: "date-time",
        localDateTime: choice.localDateTime,
        ...(choice.utcOffset ? { utcOffset: choice.utcOffset } : {})
      };
}

function choiceKey(choice: ProposedDate): string {
  return choice.kind === "date"
    ? `date:${choice.localDate}`
    : `date-time:${choice.localDateTime}:${choice.utcOffset ?? ""}`;
}

function renderChoices(): void {
  choiceList.replaceChildren();
  if (proposedDates.length === 0) {
    const empty = document.createElement("p");
    empty.className = "choice-empty";
    empty.textContent = "No dates yet. Add at least two below.";
    choiceList.append(empty);
    return;
  }
  proposedDates.forEach((choice, index) => {
    const row = document.createElement("div");
    row.className = "choice-row";
    row.dataset.index = String(index);
    const localDateTime = choice.kind === "date-time" ? choice.localDateTime.split("T") : [];
    row.innerHTML = `
      <strong class="choice-index">${index + 1}</strong>
      <div><label class="sr-only" for="choice-date-${index}">Date ${index + 1}</label><input class="input choice-date" id="choice-date-${index}" type="date" value="${choice.kind === "date" ? choice.localDate : (localDateTime[0] ?? "")}"></div>
      <div><label class="sr-only" for="choice-time-${index}">Time ${index + 1}</label><input class="input choice-time" id="choice-time-${index}" type="time" value="${localDateTime[1] ?? ""}"></div>
      <div class="choice-actions">
        <button class="btn btn-secondary btn-icon" type="button" data-action="up" aria-label="Move date ${index + 1} up" ${index === 0 ? "disabled" : ""}>↑</button>
        <button class="btn btn-secondary btn-icon" type="button" data-action="down" aria-label="Move date ${index + 1} down" ${index === proposedDates.length - 1 ? "disabled" : ""}>↓</button>
        <button class="btn btn-ghost btn-icon" type="button" data-action="remove" aria-label="Remove date ${index + 1}">✕</button>
      </div>`;
    choiceList.append(row);
  });
}

interface ZonedCandidate { instant: number; offset: string }

function zonedCandidates(localDateTime: string, zone: string): ZonedCandidate[] {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(localDateTime);
  if (!match) return [];
  const desired = match.slice(1).map(Number);
  const naive = Date.UTC(desired[0] as number, (desired[1] as number) - 1, desired[2], desired[3], desired[4]);
  const formatter = new Intl.DateTimeFormat("en-GB", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const localParts = (instant: number): number[] => {
    const parts = formatter.formatToParts(instant);
    const value = (type: Intl.DateTimeFormatPartTypes): number => Number(parts.find((part) => part.type === type)?.value ?? 0);
    return [value("year"), value("month"), value("day"), value("hour"), value("minute")];
  };
  const offsets = new Set<number>();
  for (let hours = -36; hours <= 36; hours += 6) {
    const instant = naive + hours * 3_600_000;
    const [year = 0, month = 0, day = 0, hour = 0, minute = 0] = localParts(instant);
    offsets.add(
      Math.round((Date.UTC(year, month - 1, day, hour, minute) - instant) / 60_000)
    );
  }
  const formatOffset = (minutes: number): string => `${minutes < 0 ? "-" : "+"}${String(Math.floor(Math.abs(minutes) / 60)).padStart(2, "0")}:${String(Math.abs(minutes) % 60).padStart(2, "0")}`;
  return [...offsets]
    .map((minutes) => ({ instant: naive - minutes * 60_000, offset: formatOffset(minutes) }))
    .filter(({ instant }) => localParts(instant).every((value, index) => value === desired[index]))
    .sort((left, right) => left.instant - right.instant);
}

function showChoiceError(message: string): void {
  readinessBanner.hidden = true;
  errorMessage.hidden = false;
  errorMessage.textContent = message;
}

function clearChoiceError(): void {
  errorMessage.hidden = true;
  errorMessage.textContent = "";
  readinessBanner.hidden = false;
}

function publicationIssues(): string[] {
  const issues: string[] = [];
  if (!title.value.trim()) issues.push("Add a title.");
  if (proposedDates.length === 0) issues.push("Add at least two proposed dates.");
  else if (proposedDates.length === 1) issues.push("Add at least one more proposed date (minimum two).");
  const seen = new Map<string, number>();
  proposedDates.forEach((choice, index) => {
    const date = choice.kind === "date" ? choice.localDate : choice.localDateTime.split("T")[0] ?? "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) issues.push(`Date ${index + 1} isn't a valid date.`);
    const key = choiceKey(choice);
    const first = seen.get(key);
    if (first !== undefined) issues.push(`Date ${index + 1} is the same as date ${first + 1}.`);
    else seen.set(key, index);
  });
  const locationIssue = locationError(locationField.value);
  if (locationIssue) issues.push(`Location: ${locationIssue}`);
  return issues;
}

function updatePublicationReadiness(): void {
  const issues = publicationIssues();
  readinessList.replaceChildren(...issues.map((message) => {
    const item = document.createElement("li");
    item.textContent = `— ${message}`;
    return item;
  }));
  readinessBanner.hidden = issues.length === 0;
  publishButton.disabled = issues.length > 0;
  previewButton.disabled = proposedDates.length === 0 || !title.value.trim();
}

function choiceLabel(choice: ProposedDate): string {
  const value = choice.kind === "date" ? choice.localDate : choice.localDateTime;
  const [date = "", time] = value.split("T");
  const [year = 0, month = 1, day = 1] = date.split("-").map(Number);
  const formatted = new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short"
  }).format(new Date(Date.UTC(year, month - 1, day)));
  return time ? `${formatted} ${time}` : formatted;
}

function longChoiceLabel(choice: ProposedDate): string {
  const value = choice.kind === "date" ? choice.localDate : choice.localDateTime;
  const [date = "", time] = value.split("T");
  const [year = 0, month = 1, day = 1] = date.split("-").map(Number);
  const formatted = new Intl.DateTimeFormat("en-GB", {
    weekday: "long", day: "numeric", month: "long", year: "numeric"
  }).format(new Date(Date.UTC(year, month - 1, day))).replace(",", "");
  return time ? `${formatted}, ${time}` : formatted;
}

function summaryDateLabel(choice: ProposedDate, timeZone: string): string {
  const value = choice.kind === "date" ? choice.localDate : choice.localDateTime;
  const [date = "", time] = value.split("T");
  const [year = 0, month = 1, day = 1] = date.split("-").map(Number);
  const calendarDate = new Intl.DateTimeFormat("en-GB", {
    weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC"
  }).format(new Date(Date.UTC(year, month - 1, day)));
  return choice.kind === "date" ? calendarDate
    : `${calendarDate}, ${time} · ${timeZone} · UTC${choice.utcOffset}`;
}

function createdDateLabel(createdAt: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric", month: "short", year: "numeric", timeZone
  }).format(new Date(createdAt));
}

function summaryStatusBadge(status: "draft" | "open" | "closed"): HTMLElement {
  const badge = document.createElement("span");
  badge.className = `summary-status summary-status--${status}`;
  badge.textContent = status === "draft" ? "Draft" : status === "open" ? "Open" : "Closed";
  return badge;
}

function renderPollSummary(poll: OwnedPollListResponse["items"][number], context: ReturnType<typeof myPollsContext>, table: HTMLTableSectionElement, cards: HTMLElement): void {
  const summary = {
    title: poll.title,
    destination: ownedPollDestination(poll, testRunId, context),
    created: createdDateLabel(poll.createdAt, poll.timeZone),
    dates: poll.proposedDates.map((choice) => summaryDateLabel(choice, poll.timeZone)),
    participants: `${poll.participantCount} ${poll.participantCount === 1 ? "participant" : "participants"}`
  };
  const titleLink = () => {
    const link = document.createElement("a");
    link.textContent = summary.title;
    link.href = summary.destination;
    return link;
  };
  const dateList = () => {
    if (summary.dates.length === 0) return document.createTextNode("No dates proposed");
    const list = document.createElement("ul");
    list.className = "my-polls-dates";
    for (const date of summary.dates) {
      const item = document.createElement("li");
      item.textContent = date;
      list.append(item);
    }
    return list;
  };

  const row = document.createElement("tr");
  row.append(...[
    (() => { const cell = document.createElement("th"); cell.scope = "row"; cell.append(titleLink()); return cell; })(),
    (() => { const cell = document.createElement("td"); cell.append(summaryStatusBadge(poll.status)); return cell; })(),
    (() => { const cell = document.createElement("td"); cell.textContent = summary.created; return cell; })(),
    (() => { const cell = document.createElement("td"); cell.append(dateList()); return cell; })(),
    (() => { const cell = document.createElement("td"); cell.textContent = summary.participants; return cell; })()
  ]);
  table.append(row);

  const card = document.createElement("article");
  card.className = "my-polls-card";
  const heading = document.createElement("h2");
  heading.append(titleLink());
  const details = document.createElement("dl");
  const fields: Array<[string, () => Node]> = [
    ["Status", () => summaryStatusBadge(poll.status)],
    ["Created", () => document.createTextNode(summary.created)],
    ["Proposed dates", dateList],
    ["Participants", () => document.createTextNode(summary.participants)]
  ];
  for (const [label, content] of fields) {
    const term = document.createElement("dt"); term.textContent = label;
    const description = document.createElement("dd"); description.append(content());
    details.append(term, description);
  }
  card.append(heading, details);
  cards.append(card);
}

function openPreview(): void {
  previewHeading.textContent = title.value.trim() || "New poll";
  previewDescription.textContent = description.value;
  previewDescription.hidden = description.value.length === 0;
  previewInstructions.textContent = instructions.value;
  previewInstructions.hidden = instructions.value.length === 0;
  previewMeta.replaceChildren();
  if (locationField.value) {
    previewMeta.append(document.createTextNode("Where "));
    const rendered = document.createElement("span");
    rendered.className = "markdown preview-location";
    renderLocation(rendered, locationField.value);
    previewMeta.append(rendered, document.createTextNode(" · "));
  }
  const zone = document.createElement("strong");
  zone.textContent = `Times in ${timeZone.value}`;
  previewMeta.append(zone);
  previewTableHead.replaceChildren();
  const nameHeader = document.createElement("th");
  nameHeader.textContent = "Name";
  previewTableHead.append(nameHeader);
  previewTableBodyRow.replaceChildren();
  const empty = document.createElement("td");
  empty.textContent = "No responses yet.";
  previewTableBodyRow.append(empty);
  for (const choice of proposedDates) {
    const header = document.createElement("th");
    header.scope = "col";
    header.textContent = choiceLabel(choice);
    previewTableHead.append(header);
    previewTableBodyRow.append(document.createElement("td"));
  }
  editor.hidden = true;
  previewScreen.hidden = false;
  previewHeading.focus();
}

function closePreview(): void {
  previewScreen.hidden = true;
  editor.hidden = false;
  previewButton.focus();
}

function draftPayload(): object {
  return {
    title: title.value,
    description: description.value,
    location: locationField.value,
    instructions: instructions.value,
    timeZone: timeZone.value,
    proposedDates: proposedDates.map(editableChoice)
  };
}

async function persistDraft(): Promise<PollDetails | undefined> {
  const editing = Boolean(pollId);
  const response = await request(
    editing ? `/api/organiser/polls/${encodeURIComponent(pollId as string)}` : "/api/organiser/polls",
    { method: editing ? "PUT" : "POST", body: JSON.stringify(draftPayload()) }
  );
  if (!response.ok) {
    showChoiceError(await readError(response));
    return undefined;
  }
  const poll = (await response.json()) as PollDetails;
  applyPoll(poll);
  url.searchParams.set("pollId", poll.id);
  url.searchParams.set("view", "editor");
  if (!editing) {
    url.searchParams.delete("returnFilter");
    url.searchParams.delete("returnSearch");
    for (const link of document.querySelectorAll<HTMLAnchorElement>(".my-polls-return")) {
      link.href = myPollsDestination(testRunId);
    }
  }
  window.history.replaceState({}, "", url);
  return poll;
}

function showShareScreen(link: string): void {
  editor.hidden = true;
  previewScreen.hidden = true;
  shareScreen.hidden = false;
  requireElement<HTMLElement>(".share-title").hidden = true;
  shareScreen.setAttribute("aria-label", "Share this poll");
  shareScreen.removeAttribute("aria-labelledby");
  publicPollScreen.insertBefore(shareScreen, finalDatePoster);
  publicLink.value = link;
  const organiserPollUrl = new URL(link);
  organiserPollUrl.searchParams.set("testRunId", testRunId);
  organiserPollUrl.searchParams.set("organiser", "1");
  const returnContext = pollReturnContext(url.searchParams);
  organiserPollUrl.searchParams.set("returnFilter", returnContext.filter);
  organiserPollUrl.searchParams.set("returnSearch", returnContext.search);
  goToPoll.href = organiserPollUrl.toString();
  openPublicLink.href = link;
  if (pollId) {
    openHistory.href = organiserPollDestination(pollId, "history", testRunId, returnContext);
  }
  url.searchParams.set("view", "manage");
  window.history.replaceState({}, "", url);
  void loadPublicPoll(new URL(link).pathname.split("/").at(-1) as string, true);
}

function hidePrivateScreens(): void {
  editor.hidden = true;
  previewScreen.hidden = true;
  shareScreen.hidden = true;
}

function showInvalidLink(): void {
  hidePrivateScreens();
  publicPollScreen.hidden = true;
  invalidLinkScreen.hidden = false;
  invalidLinkHeading.focus();
}

function renderPublicPoll(poll: PublicPollDetails): void {
  const firstRender = !displayedPublicPoll;
  if (displayedPublicPoll && poll.version <= displayedPublicPoll.version) return;
  const previous = displayedPublicPoll;
  displayedPublicPoll = poll;
  hidePrivateScreens();
  shareScreen.hidden = !ownerControlsAllowed || !publicLink.value;
  invalidLinkScreen.hidden = true;
  publicPollScreen.hidden = false;
  document.querySelector<HTMLElement>(".account")!.textContent = ownerControlsAllowed ? organiserId : "No account needed";
  headerSaveStatus.hidden = true;
  publicState.textContent = poll.status === "closed" ? "Closed" : "Open";
  organiserToolbar.hidden = !ownerControlsAllowed;
  requireElement<HTMLElement>(".organiser-close-hint").hidden = poll.status !== "open";
  reopenButton.hidden = !ownerControlsAllowed || poll.status !== "closed";
  requireElement<HTMLAnchorElement>(".poll-history").href = organiserPollDestination(poll.id, "history", testRunId, pollReturnContext(url.searchParams));
  publicPollHeading.textContent = poll.title;
  publicDescription.textContent = poll.description ?? "";
  publicDescription.hidden = !poll.description;
  publicInstructions.textContent = poll.instructions ?? "";
  publicInstructions.hidden = !poll.instructions;
  publicLocation.replaceChildren();
  if (poll.location) {
    const label = document.createElement("strong");
    label.textContent = "Where ";
    const rendered = document.createElement("span");
    rendered.className = "markdown";
    renderLocation(rendered, poll.location);
    publicLocation.append(label, rendered);
  }
  publicTimeZone.textContent = `Times in ${poll.timeZone}`;
  const rankingIsFrozen = poll.status === "closed";
  const responsesReadOnly = rankingIsFrozen || !publicToken;
  const selectedChoice = poll.proposedDates.find(({ id }) => id === poll.selectedDateId);
  finalDatePoster.hidden = !rankingIsFrozen || !selectedChoice;
  provisionalSelection.hidden = poll.status !== "open" || !poll.provisional || !selectedChoice;
  requireElement<HTMLElement>(".provisional-date").textContent = selectedChoice ? longChoiceLabel(selectedChoice) : "";
  if (selectedChoice) {
    finalDateHeading.textContent = longChoiceLabel(selectedChoice);
    const yesTotal = poll.participants.filter(({ availability }) => availability[selectedChoice.id] === "yes").length;
    finalDateSummary.textContent = `${yesTotal} of ${poll.participants.length} can make it`;
  }
  rankingHeading.textContent = rankingIsFrozen ? "Final ranking" : "Most popular dates";
  rankingNote.textContent = rankingIsFrozen
    ? "Frozen when the poll closed · read-only"
    : `Top ${Math.min(5, poll.proposedDates.length)} by Yes · ties keep the original order · updates live`;
  rankingList.setAttribute("aria-label", rankingIsFrozen ? "Final ranking" : "Most popular dates");
  rankingList.classList.toggle("ranking__list--frozen", rankingIsFrozen);
  rankingList.replaceChildren();
  const choicesById = new Map(poll.proposedDates.map((choice) => [choice.id, choice]));
  const maximumYes = Math.max(1, ...poll.ranking.map(({ yesTotal }) => yesTotal));
  poll.ranking.forEach((entry, index) => {
    const choice = choicesById.get(entry.choiceId);
    if (!choice) return;
    const item = document.createElement("li");
    item.className = "ranking__item";
    item.dataset.choiceId = entry.choiceId;

    const rank = document.createElement("strong");
    rank.className = "ranking__rank";
    rank.textContent = String(index + 1);

    const label = document.createElement("span");
    label.className = "ranking__date";
    label.textContent = `${choiceLabel(choice)}${entry.choiceId === poll.selectedDateId ? " ★" : ""}`;

    const bar = document.createElement("span");
    bar.className = "ranking__bar";
    bar.setAttribute("aria-hidden", "true");
    const fill = document.createElement("span");
    fill.className = "ranking__bar-fill";
    fill.style.width = `${(entry.yesTotal / maximumYes) * 100}%`;
    bar.append(fill);

    const yes = document.createElement("span");
    yes.className = "ranking__yes";
    yes.textContent = `${entry.yesTotal} yes`;

    item.append(rank, label, bar, yes);
    if (ownerControlsAllowed && !rankingIsFrozen) {
      const pick = document.createElement("button");
      pick.type = "button";
      pick.className = "btn btn-secondary ranking__pick";
      pick.textContent = "Pick…";
      pick.dataset.closeChoiceId = entry.choiceId;
      item.append(pick);
    }
    rankingList.append(item);
  });
  publicTableHead.replaceChildren();
  const name = document.createElement("th");
  name.textContent = "Name";
  publicTableHead.append(name);
  publicTableFoot.replaceChildren();
  const totalLabel = document.createElement("th");
  totalLabel.textContent = "Yes total";
  publicTableFoot.append(totalLabel);
  collaborationNotice.hidden = responsesReadOnly;
  closedNotice.hidden = !rankingIsFrozen;
  addParticipantButton.hidden = responsesReadOnly;
  tableHelp.hidden = responsesReadOnly;
  tableHelp.textContent = rankingIsFrozen
    ? ""
    : "Click a cell to switch between Yes and No, or Tab to it and press Space.";
  for (const choice of poll.proposedDates) {
    const headingCell = document.createElement("th");
    headingCell.scope = "col";
    headingCell.textContent = choiceLabel(choice);
    headingCell.classList.toggle("final-date-cell", rankingIsFrozen && choice.id === poll.selectedDateId);
    publicTableHead.append(headingCell);
    const total = document.createElement("td");
    total.textContent = String(
      poll.participants.filter(({ availability }) => availability[choice.id] === "yes").length
    );
    publicTableFoot.append(total);
  }
  if (!responsesReadOnly) {
    const actionsHeading = document.createElement("th");
    actionsHeading.scope = "col";
    actionsHeading.className = "row-actions-heading";
    actionsHeading.textContent = "Actions";
    publicTableHead.append(actionsHeading);
    publicTableFoot.append(document.createElement("td"));
  }
  publicTableBody.replaceChildren();
  if (poll.participants.length === 0) {
    const row = document.createElement("tr");
    const empty = document.createElement("td");
    empty.colSpan = poll.proposedDates.length + (responsesReadOnly ? 1 : 2);
    empty.textContent = "No one has answered yet.";
    row.append(empty);
    publicTableBody.append(row);
  } else {
    for (const participant of poll.participants) {
      const row = document.createElement("tr");
      row.dataset.participantId = participant.id;
      const nameCell = document.createElement("th");
      nameCell.scope = "row";
      nameCell.textContent = participant.displayName;
      row.append(nameCell);
      for (const choice of poll.proposedDates) {
        const cell = document.createElement("td");
        const value = participant.availability[choice.id] ?? "no";
        if (responsesReadOnly) {
          cell.textContent = value === "yes" ? "Yes" : "No";
          cell.classList.toggle("final-date-cell", choice.id === poll.selectedDateId);
        } else {
          const button = document.createElement("button");
          button.type = "button";
          button.className = `availability-toggle availability-toggle--${value}`;
          button.dataset.dateId = choice.id;
          button.dataset.participantId = participant.id;
          button.dataset.availability = value;
          button.textContent = value === "yes" ? "Yes" : "No";
          button.setAttribute("aria-pressed", String(value === "yes"));
          button.setAttribute(
            "aria-label",
            `${participant.displayName}, ${choiceLabel(choice)}: ${value === "yes" ? "Yes" : "No"}`
          );
          cell.append(button);
        }
        row.append(cell);
      }
      if (responsesReadOnly) { publicTableBody.append(row); continue; }
      const actions = document.createElement("td");
      actions.className = "row-actions";
      const trigger = document.createElement("button");
      trigger.className = "icon-button row-actions-trigger";
      trigger.type = "button";
      trigger.textContent = "⋯";
      trigger.setAttribute("aria-label", `Actions for ${participant.displayName}`);
      trigger.setAttribute("aria-expanded", "false");
      const menu = document.createElement("div");
      menu.className = "row-menu";
      menu.hidden = true;
      for (const [action, label] of [["rename", "Rename…"], ["delete", "Delete…"]] as const) {
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.participantAction = action;
        button.textContent = label;
        if (action === "delete") button.className = "danger-action";
        menu.append(button);
      }
      actions.append(trigger, menu);
      row.append(actions);
      publicTableBody.append(row);
    }
  }
  if (previous && poll.version > previous.version) {
    for (const participant of poll.participants) {
      const oldParticipant = previous.participants.find(({ id }) => id === participant.id);
      if (!oldParticipant) continue;
      for (const choice of poll.proposedDates) {
        if (oldParticipant.availability[choice.id] === participant.availability[choice.id]) continue;
        const changed = publicTableBody.querySelector<HTMLElement>(
          `.availability-toggle[data-participant-id="${CSS.escape(participant.id)}"][data-date-id="${CSS.escape(choice.id)}"]`
        );
        changed?.classList.add("availability-toggle--fresh");
        if (changed) window.setTimeout(() => changed.classList.remove("availability-toggle--fresh"), 1_600);
      }
    }
  }
  if (firstRender) publicPollHeading.focus();
}

function namesList(names: string[]): DocumentFragment {
  const fragment = document.createDocumentFragment();
  for (const name of names.length > 0 ? names : ["Nobody"]) {
    const item = document.createElement("li");
    item.textContent = name;
    fragment.append(item);
  }
  return fragment;
}

function openCloseDialog(choiceId: string): void {
  if (!displayedPublicPoll || displayedPublicPoll.status !== "open") return;
  const choice = displayedPublicPoll.proposedDates.find(({ id }) => id === choiceId);
  if (!choice) return;
  const yes = displayedPublicPoll.participants.filter(({ availability }) => availability[choiceId] === "yes").map(({ displayName }) => displayName);
  const no = displayedPublicPoll.participants.filter(({ availability }) => availability[choiceId] !== "yes").map(({ displayName }) => displayName);
  closeDialog.dataset.choiceId = choiceId;
  closeDialogDate.textContent = longChoiceLabel(choice);
  closeYesHeading.textContent = `Yes · ${yes.length}`;
  closeNoHeading.textContent = `No · ${no.length}`;
  closeYesList.replaceChildren(namesList(yes));
  closeNoList.replaceChildren(namesList(no));
  closeDialogError.hidden = true;
  closeDialogError.textContent = "";
  closeConfirm.disabled = false;
  closeDialog.showModal();
  closeConfirm.focus();
}

async function loadPublicPoll(token: string, publishedByOwner = false): Promise<void> {
  publicToken = token;
  const response = await fetch(`/api/public/polls/${encodeURIComponent(token)}`, {
    headers: { accept: "application/json" }
  });
  if (!response.ok) {
    showInvalidLink();
    return;
  }
  const poll = (await response.json()) as PublicPollDetails;
  if (organiserView || publishedByOwner) {
    const ownerResponse = await request(`/api/organiser/polls/${encodeURIComponent(poll.id)}`);
    ownerControlsAllowed = ownerResponse.ok;
  }
  renderPublicPoll(poll);
  if (publishedByOwner && ownerControlsAllowed) shareScreen.hidden = false;
}

function updateLocationDialogPreview(): void {
  const issue = locationError(locationDialogField.value);
  locationDialogPreview.replaceChildren();
  if (issue) locationDialogPreview.textContent = "Preview paused until the location is safe.";
  else renderLocation(locationDialogPreview, locationDialogField.value);
  locationDialogField.setAttribute("aria-invalid", String(Boolean(issue)));
}

async function saveLocationDialog(): Promise<void> {
  if (!displayedPublicPoll || !ownerControlsAllowed) return;
  locationDialogError.hidden = true;
  locationSave.disabled = true;
  locationClear.disabled = true;
  try {
    const response = await request(`/api/organiser/polls/${encodeURIComponent(displayedPublicPoll.id)}/location`, {
      method: "PUT", body: JSON.stringify({ location: locationDialogField.value })
    });
    if (!response.ok) {
      locationDialogError.textContent = await readError(response);
      locationDialogError.hidden = false;
      locationDialogField.setAttribute("aria-invalid", "true");
      return;
    }
    // Fetch a complete current projection even while background polling is in flight.
    const current = await currentPollResponse();
    if (current.ok) renderPublicPoll((await current.json()) as PublicPollDetails);
    locationDialog.close();
    publicToast.textContent = locationDialogField.value ? "Location saved — showing on the public poll now." : "Location cleared from the public poll.";
    publicToast.hidden = false;
    window.setTimeout(() => { publicToast.hidden = true; }, 3600);
  } catch {
    locationDialogError.textContent = "Location could not be saved. Try again.";
    locationDialogError.hidden = false;
  } finally {
    locationSave.disabled = false;
    locationClear.disabled = false;
  }
}

function currentPollResponse(): Promise<Response> {
  return publicToken
    ? fetch(`/api/public/polls/${encodeURIComponent(publicToken)}`, { headers: { accept: "application/json" } })
    : request(`/api/organiser/polls/${encodeURIComponent(pollId as string)}`);
}

async function refreshPublicPoll(): Promise<void> {
  if ((!publicToken && !ownerControlsAllowed) || publicRefreshInFlight || document.visibilityState === "hidden") return;
  publicRefreshInFlight = true;
  try {
    const response = await currentPollResponse();
    if (response.ok) renderPublicPoll((await response.json()) as PublicPollDetails);
  } finally {
    publicRefreshInFlight = false;
  }
}

function openParticipantDialog(
  mode: "add" | "rename" | "delete",
  participant?: PublicPollDetails["participants"][number]
): void {
  participantDialogMode = mode;
  selectedParticipantId = participant?.id;
  if (mode === "add") {
    participantDialogHeading.textContent = "Add a row";
    participantDialogCopy.textContent = "Every date starts as No. The row saves as soon as you add it.";
    participantInputLabel.textContent = "Display name";
    participantName.value = "";
    participantSubmit.textContent = "Add row";
  } else if (mode === "rename" && participant) {
    participantDialogHeading.textContent = `Rename “${participant.displayName}”`;
    participantDialogCopy.textContent = "Answers stay the same.";
    participantInputLabel.textContent = "New name";
    participantName.value = participant.displayName;
    participantSubmit.textContent = "Rename";
  } else if (participant) {
    participantDialogHeading.textContent = `Delete ${participant.displayName}'s row?`;
    participantDialogCopy.textContent = `Type ${participant.displayName} to confirm. The organiser can undo this from the history.`;
    participantInputLabel.textContent = `Type ${participant.displayName} to confirm`;
    participantName.value = "";
    participantSubmit.textContent = "Delete row";
  }
  participantDialogError.hidden = true;
  participantDialogError.textContent = "";
  participantSubmit.disabled = false;
  participantDialog.showModal();
  participantName.focus();
}

async function mutatePublicPoll(path: string, init: RequestInit): Promise<PublicPollDetails | undefined> {
  const response = await fetch(path, {
    ...init,
    headers: { accept: "application/json", "content-type": "application/json", ...init.headers }
  });
  if (!response.ok) {
    const message = await readError(response);
    if (participantDialog.open) {
      participantDialogError.hidden = false;
      participantDialogError.textContent = message;
    } else {
      publicToast.hidden = false;
      publicToast.textContent = message;
    }
    return undefined;
  }
  const poll = (await response.json()) as PublicPollDetails;
  renderPublicPoll(poll);
  return poll;
}

function addProposedDate(): void {
  clearChoiceError();
  if (!newDate.value) {
    showChoiceError("Enter a valid date.");
    newDate.focus();
    return;
  }
  let choice: ProposedDate;
  if (!newTime.value) {
    choice = { kind: "date", localDate: newDate.value };
  } else {
    const localDateTime = `${newDate.value}T${newTime.value}`;
    const candidates = zonedCandidates(localDateTime, timeZone.value);
    if (candidates.length === 0) {
      showChoiceError("That local time does not exist in this time zone.");
      return;
    }
    if (candidates.length > 1 && !newOffset.value) {
      newOffset.replaceChildren(...candidates.map(({ offset }) => new Option(`UTC ${offset}`, offset)));
      newOffset.value = "";
      newOffset.prepend(new Option("Select an offset", ""));
      offsetField.hidden = false;
      showChoiceError("That local time happens twice. Choose which UTC offset you mean.");
      return;
    }
    const selectedOffset = candidates.length > 1 ? newOffset.value : candidates[0]?.offset;
    choice = {
      kind: "date-time",
      localDateTime,
      ...(selectedOffset ? { utcOffset: selectedOffset } : {})
    };
  }
  if (proposedDates.some((existing) => choiceKey(editableChoice(existing)) === choiceKey(choice))) {
    showChoiceError(`${newDate.value} ${newTime.value}`.trim() + " is already proposed — duplicate dates aren't added.");
    return;
  }
  proposedDates.push(choice);
  offsetField.hidden = true;
  newOffset.replaceChildren();
  renderChoices();
  updatePublicationReadiness();
}

function applyPoll(poll: PollDetails): void {
  title.value = poll.title; description.value = poll.description ?? ""; locationField.value = poll.location ?? ""; instructions.value = poll.instructions ?? ""; timeZone.value = poll.timeZone; proposedDates = poll.proposedDates.map(editableChoice);
  heading.textContent = poll.title || "New poll"; pollId = poll.id; saveButton.textContent = "Save changes"; showSaved(poll); updatePreview();
  renderChoices();
  updatePublicationReadiness();
}

async function request(path: string, init?: RequestInit): Promise<Response> {
  return fetch(path, { ...init, headers: { accept: "application/json", "content-type": "application/json", "x-local-organiser-id": organiserId, ...init?.headers } });
}

function historyValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  if (typeof value === "object" && value && "displayName" in value) {
    return String((value as { displayName?: unknown }).displayName ?? "—");
  }
  if (typeof value === "object" && value && "status" in value) {
    return String((value as { status?: unknown }).status ?? "—");
  }
  return "Changed values";
}

function appendHistoryRows(items: AuditHistoryEvent[]): void {
  const alreadyUndone = new Set(items.flatMap(({ undoOf }) => undoOf ? [undoOf.id] : []));
  for (const event of items) {
    const row = document.createElement("tr");
    if (event.action === "UNDO") row.className = "history-row--undo";
    const actor = event.actor.category === "organiser"
      ? `${event.actor.subject ?? "Organiser"} (organiser)`
      : "Anonymous link holder";
    const values = [
      `#${event.revision}`,
      new Date(event.occurredAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit" }),
      actor,
      event.summary,
      historyValue(event.before),
      historyValue(event.after)
    ];
    values.forEach((value, index) => {
      const cell = document.createElement(index === 3 ? "th" : "td");
      if (index === 3) (cell as HTMLTableCellElement).scope = "row";
      cell.textContent = value;
      row.append(cell);
    });
    const undoCell = document.createElement("td");
    if (["AVAILABILITY_CHANGED", "PARTICIPANT_RENAMED", "PARTICIPANT_ADDED", "PARTICIPANT_DELETED"].includes(event.action) && !alreadyUndone.has(event.id)) {
      const undoButton = document.createElement("button");
      undoButton.type = "button";
      undoButton.className = "btn btn-ghost history-undo";
      undoButton.dataset.eventId = event.id;
      undoButton.textContent = "Undo";
      undoCell.append(undoButton);
    }
    row.append(undoCell);
    historyBody.append(row);
  }
}

async function openUndoPreview(eventId: string): Promise<void> {
  if (!pollId) return;
  historyError.hidden = true;
  const response = await request(`/api/organiser/polls/${encodeURIComponent(pollId)}/history/${encodeURIComponent(eventId)}/undo-preview`, { method: "POST" });
  if (!response.ok) {
    historyError.hidden = false;
    historyError.textContent = await readError(response);
    return;
  }
  const preview = (await response.json()) as UndoPreview;
  selectedUndoEventId = preview.eventId;
  undoDialogHeading.textContent = `Undo #${preview.revision}?`;
  undoDialogSummary.textContent = preview.summary;
  undoDialogWarning.hidden = !preview.wouldOverwrite;
  undoDialogWarning.textContent = preview.warning ?? "";
  undoConfirm.textContent = preview.wouldOverwrite ? "Overwrite & undo" : "Undo change";
  undoDialogError.hidden = true;
  undoConfirm.disabled = false;
  undoDialog.showModal();
  undoConfirm.focus();
}

async function confirmUndo(): Promise<void> {
  if (!pollId || !selectedUndoEventId) return;
  undoConfirm.disabled = true;
  const response = await request(`/api/organiser/polls/${encodeURIComponent(pollId)}/history/${encodeURIComponent(selectedUndoEventId)}/undo`, {
    method: "POST",
    body: JSON.stringify({ confirmed: true })
  });
  if (!response.ok) {
    undoDialogError.hidden = false;
    undoDialogError.textContent = await readError(response);
    undoConfirm.disabled = false;
    return;
  }
  undoDialog.close();
  selectedUndoEventId = undefined;
  historyStatus.textContent = "Undone. The original entry remains in history.";
  await loadHistory(pollId);
}

async function loadHistory(id: string, cursor?: string): Promise<void> {
  historyMore.disabled = true;
  historyError.hidden = true;
  const response = await request(`/api/organiser/polls/${encodeURIComponent(id)}/history`, {
    headers: {
      "x-audit-page-size": "25",
      ...(cursor ? { "x-audit-cursor": cursor } : {})
    }
  });
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      historyScreen.hidden = true;
      historyAccessDenied.hidden = false;
      historyBody.replaceChildren();
      selectedUndoEventId = undefined;
      if (undoDialog.open) undoDialog.close();
      historyAccessHeading.focus();
      return;
    }
    historyScreen.hidden = false;
    historyError.hidden = false;
    historyError.textContent = await readError(response);
    return;
  }
  historyAccessDenied.hidden = true;
  historyScreen.hidden = false;
  const page = (await response.json()) as AuditHistoryPage;
  if (!cursor) historyBody.replaceChildren();
  appendHistoryRows(page.items);
  historySummary.textContent = `${page.total} ${page.total === 1 ? "change" : "changes"}, newest first. Undo adds a new entry — nothing is ever removed.`;
  historyMore.hidden = !page.nextCursor;
  historyMore.disabled = false;
  historyMore.dataset.cursor = page.nextCursor ?? "";
  historyHeading.focus();
}

async function readError(response: Response): Promise<string> {
  const body = (await response.json()) as { error?: { message?: string } };
  return body.error?.message ?? "The draft could not be saved. Try again.";
}

async function loadDraft(id: string): Promise<void> {
  const response = await request(`/api/organiser/polls/${encodeURIComponent(id)}`);
  if (!response.ok) { editor.hidden = false; errorMessage.hidden = false; errorMessage.textContent = await readError(response); return; }
  const poll = (await response.json()) as PollDetails | PublicPollDetails;
  if (poll.status === "draft") { editor.hidden = false; applyPoll(poll); }
  else {
    ownerControlsAllowed = true;
    renderPublicPoll(poll as PublicPollDetails);
  }
}

async function loadMyPolls(): Promise<void> {
  const generation = ++ownedListRequest;
  const context = myPollsContext(url.searchParams);
  myPollsList.replaceChildren();
  myPollsError.hidden = true;
  myPollsStatus.textContent = "Loading your polls…";
  for (const button of document.querySelectorAll<HTMLButtonElement>(".my-polls-filters button")) {
    button.setAttribute("aria-pressed", String(button.dataset.filter === context.filter));
  }
  try {
    const params = new URLSearchParams({ filter: context.filter, search: context.search, pageSize: "25" });
    const response = await request(`/api/organiser/polls?${params}`);
    if (generation !== ownedListRequest) return;
    if (!response.ok) {
      myPollsStatus.textContent = "";
      myPollsError.textContent = response.status === 401 ? "Sign in to view your polls." : await readError(response);
      myPollsError.hidden = false;
      return;
    }
    const page = (await response.json()) as OwnedPollListResponse;
    if (generation !== ownedListRequest) return;
    const desktop = document.createElement("div");
    desktop.className = "my-polls-desktop";
    const table = document.createElement("table");
    table.className = "table";
    table.setAttribute("aria-label", "Poll summaries");
    table.innerHTML = "<thead><tr><th scope=\"col\">Title</th><th scope=\"col\">Status</th><th scope=\"col\">Created</th><th scope=\"col\">Proposed dates</th><th scope=\"col\">Participants</th></tr></thead>";
    const body = document.createElement("tbody");
    table.append(body);
    desktop.append(table);
    const mobile = document.createElement("div");
    mobile.className = "my-polls-mobile";
    myPollsList.append(desktop, mobile);
    for (const poll of page.items) renderPollSummary(poll, context, body, mobile);
    myPollsStatus.textContent = page.items.length || page.nextCursor ? "" : "No polls to show.";
  } catch {
    if (generation !== ownedListRequest) return;
    myPollsStatus.textContent = "";
    myPollsError.textContent = "Could not load your polls. Try again.";
    myPollsError.hidden = false;
  }
}

requireElement<HTMLElement>(".my-polls-filters").addEventListener("click", (event) => {
  const filter = (event.target as Element).closest<HTMLButtonElement>("button[data-filter]")?.dataset.filter;
  if (!filter) return;
  url.searchParams.set("filter", filter);
  window.history.replaceState({}, "", url);
  void loadMyPolls();
});

locationField.addEventListener("input", () => { updatePreview(); updatePublicationReadiness(); });
requireElement<HTMLButtonElement>(".edit-location").addEventListener("click", () => {
  if (!displayedPublicPoll || !ownerControlsAllowed) return;
  locationDialogField.value = displayedPublicPoll.location ?? "";
  requireElement<HTMLElement>(".location-state-note").textContent = `the poll stays ${displayedPublicPoll.status === "closed" ? "Closed" : "Open"}`;
  locationDialogError.hidden = true;
  updateLocationDialogPreview();
  locationDialog.setAttribute("aria-labelledby", "location-dialog-heading");
  locationDialog.showModal();
  locationDialogField.focus();
});
locationDialogField.addEventListener("input", updateLocationDialogPreview);
locationDialog.addEventListener("close", () => locationDialog.removeAttribute("aria-labelledby"));
locationDialog.addEventListener("submit", (event) => { event.preventDefault(); void saveLocationDialog(); });
locationClear.addEventListener("click", () => { locationDialogField.value = ""; void saveLocationDialog(); });
requireElement<HTMLButtonElement>(".location-cancel").addEventListener("click", () => locationDialog.close());
locationDialog.addEventListener("click", (event) => {
  if (event.target !== locationDialog) return;
  const box = locationDialog.getBoundingClientRect();
  if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) locationDialog.close();
});
title.addEventListener("input", () => { heading.textContent = title.value.trim() || "New poll"; updatePublicationReadiness(); });
timeZone.addEventListener("change", updatePublicationReadiness);
previewButton.addEventListener("click", openPreview);
backToEditor.addEventListener("click", closePreview);
addDateButton.addEventListener("click", addProposedDate);
for (const field of [newDate, newTime]) {
  field.addEventListener("input", () => {
    offsetField.hidden = true;
    newOffset.replaceChildren();
  });
}
choiceList.addEventListener("input", (event) => {
  const input = event.target as HTMLInputElement;
  const row = input.closest<HTMLElement>(".choice-row");
  const index = Number(row?.dataset.index);
  if (!Number.isInteger(index)) return;
  const date = row?.querySelector<HTMLInputElement>(".choice-date")?.value ?? "";
  const time = row?.querySelector<HTMLInputElement>(".choice-time")?.value ?? "";
  proposedDates[index] = time
    ? { kind: "date-time", localDateTime: `${date}T${time}` }
    : { kind: "date", localDate: date };
  updatePublicationReadiness();
});
choiceList.addEventListener("click", (event) => {
  const button = (event.target as Element).closest<HTMLButtonElement>("button[data-action]");
  const row = button?.closest<HTMLElement>(".choice-row");
  const index = Number(row?.dataset.index);
  if (!button || !Number.isInteger(index)) return;
  const action = button.dataset.action;
  if (action === "remove") proposedDates.splice(index, 1);
  if (action === "up" && index > 0) [proposedDates[index - 1], proposedDates[index]] = [proposedDates[index] as ProposedDate, proposedDates[index - 1] as ProposedDate];
  if (action === "down" && index < proposedDates.length - 1) [proposedDates[index], proposedDates[index + 1]] = [proposedDates[index + 1] as ProposedDate, proposedDates[index] as ProposedDate];
  renderChoices();
  updatePublicationReadiness();
});
form.addEventListener("submit", (event) => {
  event.preventDefault();
  void (async () => {
    clearChoiceError(); saveStatus.textContent = "";
    if (!title.value.trim()) { showChoiceError("Enter a poll title."); title.focus(); return; }
    const issue = locationError(locationField.value);
    if (issue) { showChoiceError(issue); locationField.focus(); return; }
    saveButton.disabled = true; saveButton.textContent = "Saving…";
    const editing = Boolean(pollId);
    const poll = await persistDraft();
    saveButton.disabled = false;
    if (!poll) { saveButton.textContent = editing ? "Save changes" : "Save draft"; return; }
    saveStatus.textContent = editing ? "Changes saved." : "Draft saved."; headerSaveStatus.textContent = `All changes saved · ${new Date().toLocaleTimeString("en-GB")}`;
  })();
});

publishButton.addEventListener("click", () => {
  void (async () => {
    clearChoiceError();
    publishButton.disabled = true;
    publishButton.textContent = "Publishing…";
    const poll = await persistDraft();
    if (!poll || !pollId) {
      publishButton.textContent = "Publish";
      updatePublicationReadiness();
      return;
    }
    const response = await request(`/api/organiser/polls/${encodeURIComponent(pollId)}/publish`, { method: "POST" });
    if (!response.ok) {
      showChoiceError(await readError(response));
      publishButton.textContent = "Publish";
      updatePublicationReadiness();
      return;
    }
    const result = (await response.json()) as { publicUrl: string };
    showShareScreen(result.publicUrl);
  })();
});

copyLinkButton.addEventListener("click", () => {
  void navigator.clipboard.writeText(publicLink.value).then(() => {
    copyLinkButton.textContent = "Copied ✓";
    shareStatus.textContent = "Public poll link copied.";
  });
});

addParticipantButton.addEventListener("click", () => openParticipantDialog("add"));
rankingList.addEventListener("click", (event) => {
  const button = (event.target as Element).closest<HTMLButtonElement>("button[data-close-choice-id]");
  if (button?.dataset.closeChoiceId) openCloseDialog(button.dataset.closeChoiceId);
});
closeCancel.addEventListener("click", () => closeDialog.close());
reopenButton.addEventListener("click", () => {
  if (!ownerControlsAllowed || displayedPublicPoll?.status !== "closed") return;
  const choice = displayedPublicPoll.proposedDates.find(({ id }) => id === displayedPublicPoll?.selectedDateId);
  if (!choice) return;
  requireElement<HTMLElement>(".reopen-note").textContent = `${longChoiceLabel(choice)} will stay as a provisional pick until you close the poll again.`;
  reopenError.hidden = true;
  reopenError.textContent = "";
  reopenConfirm.disabled = false;
  reopenDialog.showModal();
  reopenConfirm.focus();
});
requireElement<HTMLButtonElement>(".reopen-cancel").addEventListener("click", () => reopenDialog.close());
reopenDialog.addEventListener("click", (event) => {
  if (event.target !== reopenDialog) return;
  const box = reopenDialog.getBoundingClientRect();
  if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) reopenDialog.close();
});
reopenDialog.addEventListener("submit", (event) => {
  event.preventDefault();
  const reopeningPollId = displayedPublicPoll?.id;
  if (!reopeningPollId || !ownerControlsAllowed || reopenConfirm.disabled) return;
  void (async () => {
    reopenConfirm.disabled = true;
    reopenConfirm.textContent = "Reopening…";
    try {
      const response = await request(`/api/organiser/polls/${encodeURIComponent(reopeningPollId)}/reopen`, {
        method: "POST", body: JSON.stringify({ confirmed: true })
      });
      if (!response.ok) {
        reopenError.hidden = false;
        reopenError.textContent = await readError(response);
        return;
      }
      const result = (await response.json()) as { poll: PublicPollDetails };
      reopenDialog.close();
      renderPublicPoll(result.poll);
      publicPollHeading.focus();
      publicToast.textContent = "Poll reopened. The previous final date is now provisional.";
      publicToast.hidden = false;
      window.setTimeout(() => { publicToast.hidden = true; }, 3600);
    } catch {
      reopenError.hidden = false;
      reopenError.textContent = "Could not reopen the poll. Check your connection and try again.";
    } finally {
      reopenConfirm.disabled = false;
      reopenConfirm.textContent = "Reopen poll";
    }
  })();
});
closeDialog.addEventListener("submit", (event) => {
  event.preventDefault();
  const selectedDateId = closeDialog.dataset.choiceId;
  const closingPollId = displayedPublicPoll?.id;
  if (!closingPollId || !selectedDateId) return;
  void (async () => {
    closeConfirm.disabled = true;
    closeConfirm.textContent = "Closing…";
    const response = await request(`/api/organiser/polls/${encodeURIComponent(closingPollId)}/close`, {
      method: "POST",
      body: JSON.stringify({ selectedDateId, confirmed: true })
    });
    closeConfirm.disabled = false;
    closeConfirm.textContent = "Confirm & close poll";
    if (!response.ok) {
      closeDialogError.hidden = false;
      closeDialogError.textContent = await readError(response);
      return;
    }
    const result = (await response.json()) as { poll: PublicPollDetails };
    closeDialog.close();
    renderPublicPoll(result.poll);
  })();
});
publicTableBody.addEventListener("click", (event) => {
  const target = event.target as Element;
  const availabilityButton = target.closest<HTMLButtonElement>(".availability-toggle");
  if (availabilityButton && publicToken) {
    const participantId = availabilityButton.dataset.participantId;
    const dateId = availabilityButton.dataset.dateId;
    const availability = availabilityButton.dataset.availability === "yes" ? "no" : "yes";
    if (!participantId || !dateId) return;
    availabilityButton.disabled = true;
    availabilityButton.setAttribute("aria-busy", "true");
    void mutatePublicPoll(
      `/api/public/polls/${encodeURIComponent(publicToken)}/participants/${encodeURIComponent(participantId)}`,
      { method: "PUT", body: JSON.stringify({ dateId, availability }) }
    ).finally(() => {
      availabilityButton.disabled = false;
      availabilityButton.removeAttribute("aria-busy");
    });
    return;
  }
  const row = target.closest<HTMLTableRowElement>("tr[data-participant-id]");
  const participant = displayedPublicPoll?.participants.find(({ id }) => id === row?.dataset.participantId);
  if (!row || !participant) return;
  const trigger = target.closest<HTMLButtonElement>(".row-actions-trigger");
  if (trigger) {
    const menu = trigger.nextElementSibling as HTMLElement | null;
    if (!menu) return;
    const opening = menu.hidden;
    for (const other of publicTableBody.querySelectorAll<HTMLElement>(".row-menu")) other.hidden = true;
    menu.hidden = !opening;
    trigger.setAttribute("aria-expanded", String(opening));
    return;
  }
  const action = target.closest<HTMLButtonElement>("button[data-participant-action]")?.dataset.participantAction;
  if (action === "rename" || action === "delete") openParticipantDialog(action, participant);
});
participantCancel.addEventListener("click", () => participantDialog.close());
participantForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!publicToken) return;
  void (async () => {
    participantSubmit.disabled = true;
    participantSubmit.textContent = participantDialogMode === "add" ? "Adding…" : "Saving…";
    const collection = `/api/public/polls/${encodeURIComponent(publicToken as string)}/participants`;
    const isAdd = participantDialogMode === "add";
    const poll = await mutatePublicPoll(
      isAdd ? collection : `${collection}/${encodeURIComponent(selectedParticipantId as string)}`,
      participantDialogMode === "delete"
        ? { method: "DELETE", body: JSON.stringify({ confirmation: participantName.value }) }
        : {
            method: isAdd ? "POST" : "PUT",
            body: JSON.stringify({ displayName: participantName.value })
          }
    );
    participantSubmit.disabled = false;
    participantSubmit.textContent = participantDialogMode === "add" ? "Add row" : participantDialogMode === "rename" ? "Rename" : "Delete row";
    if (poll) participantDialog.close();
  })();
});
historyMore.addEventListener("click", () => {
  if (pollId && historyMore.dataset.cursor) void loadHistory(pollId, historyMore.dataset.cursor);
});
historyBody.addEventListener("click", (event) => {
  const button = (event.target as Element).closest<HTMLButtonElement>(".history-undo");
  if (button?.dataset.eventId) void openUndoPreview(button.dataset.eventId);
});
undoCancel.addEventListener("click", () => undoDialog.close());
undoDialog.addEventListener("submit", (event) => {
  event.preventDefault();
  void confirmUndo();
});

async function checkApi(): Promise<void> {
  try {
    const response = await fetch("/health", { headers: { accept: "application/json" } });
    if (!response.ok) throw new Error("health");
    health.textContent = "API healthy"; health.parentElement?.classList.add("health--ready");
  } catch { health.textContent = "API unavailable"; health.parentElement?.classList.add("health--failed"); }
}

const publicPath = /^\/p\/([^/]+)$/.exec(window.location.pathname);
updatePreview(); renderChoices(); updatePublicationReadiness(); void checkApi();
if (publicPath?.[1]) {
  void loadPublicPoll(publicPath[1]);
}
else if (pollId && historyView) {
  editor.hidden = true;
  previewScreen.hidden = true;
  shareScreen.hidden = true;
  publicPollScreen.hidden = true;
  historyScreen.hidden = true;
  historyAccessDenied.hidden = true;
  historyBack.href = organiserPollDestination(pollId, "manage", testRunId, pollReturnContext(url.searchParams));
  void loadHistory(pollId);
}
else if (pollId) void loadDraft(pollId);
else if (creationView) editor.hidden = false;
else { myPollsScreen.hidden = false; headerSaveStatus.hidden = true; void loadMyPolls(); }
window.setInterval(() => void refreshPublicPoll(), 750);
document.addEventListener("visibilitychange", () => void refreshPublicPoll());
window.addEventListener("focus", () => void refreshPublicPoll());
