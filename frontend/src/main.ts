import "./styles.css";

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
  status: "draft";
  version: number;
  timeZone: string;
  proposedDates: ProposedDate[];
  description?: string;
  instructions?: string;
  location?: string;
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
  <section class="editor" aria-labelledby="draft-heading">
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
  </section>`;

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
const url = new URL(window.location.href);
const testRunId = url.searchParams.get("testRunId") ?? "browser";
const organiserId = `local-organiser-${testRunId.toLowerCase().replace(/[^a-z0-9-]/g, "-")}`;
let pollId = url.searchParams.get("pollId");
let proposedDates: ProposedDate[] = [];

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

async function readError(response: Response): Promise<string> {
  const body = (await response.json()) as { error?: { message?: string } };
  return body.error?.message ?? "The draft could not be saved. Try again.";
}

async function loadDraft(id: string): Promise<void> {
  const response = await request(`/api/organiser/polls/${encodeURIComponent(id)}`);
  if (!response.ok) { errorMessage.hidden = false; errorMessage.textContent = await readError(response); return; }
  applyPoll((await response.json()) as PollDetails);
}

locationField.addEventListener("input", () => { updatePreview(); updatePublicationReadiness(); });
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
    const response = await request(editing ? `/api/organiser/polls/${encodeURIComponent(pollId as string)}` : "/api/organiser/polls", {
      method: editing ? "PUT" : "POST",
      body: JSON.stringify({ title: title.value, description: description.value, location: locationField.value, instructions: instructions.value, timeZone: timeZone.value, proposedDates: proposedDates.map(editableChoice) })
    });
    saveButton.disabled = false;
    if (!response.ok) { showChoiceError(await readError(response)); saveButton.textContent = editing ? "Save changes" : "Save draft"; return; }
    const poll = (await response.json()) as PollDetails;
    applyPoll(poll); url.searchParams.set("pollId", poll.id); window.history.replaceState({}, "", url); saveStatus.textContent = editing ? "Changes saved." : "Draft saved."; headerSaveStatus.textContent = `All changes saved · ${new Date().toLocaleTimeString("en-GB")}`;
  })();
});

async function checkApi(): Promise<void> {
  try {
    const response = await fetch("/health", { headers: { accept: "application/json" } });
    if (!response.ok) throw new Error("health");
    health.textContent = "API healthy"; health.parentElement?.classList.add("health--ready");
  } catch { health.textContent = "API unavailable"; health.parentElement?.classList.add("health--failed"); }
}

updatePreview(); renderChoices(); updatePublicationReadiness(); void checkApi(); if (pollId) void loadDraft(pollId);
