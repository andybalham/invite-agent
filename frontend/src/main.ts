import "./styles.css";

interface PollDetails {
  id: string;
  title: string;
  status: "draft";
  version: number;
  timeZone: string;
  proposedDates: [];
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
          <button class="btn btn-secondary" type="button" disabled title="Add proposed dates before previewing">Preview</button>
          <button class="btn btn-primary" type="button" disabled title="Add proposed dates before publishing">Publish</button>
        </div>
      </div>
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
        <div class="saved-card field--wide" hidden data-testid="saved-card"><span>Last saved location</span><div class="markdown" data-testid="saved-location"></div></div>
        <div class="form-message field--wide"><p class="alert error" role="alert" hidden></p><p class="save-status" role="status" aria-live="polite"></p></div>
        <div class="actions field--wide"><p>Required fields are marked <b>*</b></p><button class="btn btn-primary save-button" type="submit">Save draft</button></div>
      </form>
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
const locationCount = requireElement<HTMLElement>("[data-testid='location-count']");
const preview = requireElement<HTMLElement>("[data-testid='location-preview']");
const savedCard = requireElement<HTMLElement>("[data-testid='saved-card']");
const savedLocation = requireElement<HTMLElement>("[data-testid='saved-location']");
const errorMessage = requireElement<HTMLElement>("[role='alert']");
const saveStatus = requireElement<HTMLElement>(".save-status");
const saveButton = requireElement<HTMLButtonElement>(".save-button");
const health = requireElement<HTMLElement>("[data-testid='api-health']");
const heading = requireElement<HTMLElement>("#draft-heading");
const headerSaveStatus = requireElement<HTMLElement>("[data-testid='header-save-status']");
const url = new URL(window.location.href);
const testRunId = url.searchParams.get("testRunId") ?? "browser";
const organiserId = `local-organiser-${testRunId.toLowerCase().replace(/[^a-z0-9-]/g, "-")}`;
let pollId = url.searchParams.get("pollId");

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

function applyPoll(poll: PollDetails): void {
  title.value = poll.title; description.value = poll.description ?? ""; locationField.value = poll.location ?? ""; instructions.value = poll.instructions ?? ""; timeZone.value = poll.timeZone;
  heading.textContent = poll.title || "New poll"; pollId = poll.id; saveButton.textContent = "Save changes"; showSaved(poll); updatePreview();
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

locationField.addEventListener("input", updatePreview);
title.addEventListener("input", () => { heading.textContent = title.value.trim() || "New poll"; });
form.addEventListener("submit", (event) => {
  event.preventDefault();
  void (async () => {
    errorMessage.hidden = true; errorMessage.textContent = ""; saveStatus.textContent = "";
    if (!title.value.trim()) { errorMessage.hidden = false; errorMessage.textContent = "Enter a poll title."; title.focus(); return; }
    const issue = locationError(locationField.value);
    if (issue) { errorMessage.hidden = false; errorMessage.textContent = issue; locationField.focus(); return; }
    saveButton.disabled = true; saveButton.textContent = "Saving…";
    const editing = Boolean(pollId);
    const response = await request(editing ? `/api/organiser/polls/${encodeURIComponent(pollId as string)}` : "/api/organiser/polls", {
      method: editing ? "PUT" : "POST",
      body: JSON.stringify({ title: title.value, description: description.value, location: locationField.value, instructions: instructions.value, timeZone: timeZone.value, proposedDates: [] })
    });
    saveButton.disabled = false;
    if (!response.ok) { errorMessage.hidden = false; errorMessage.textContent = await readError(response); saveButton.textContent = editing ? "Save changes" : "Save draft"; return; }
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

updatePreview(); void checkApi(); if (pollId) void loadDraft(pollId);
