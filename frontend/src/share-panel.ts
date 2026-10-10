export type SharePanelState =
  | { status: "idle" | "loading" }
  | { status: "ready"; publicUrl: string }
  | { status: "error"; message?: string | undefined }
  | { status: "legacy" };

export interface SharePanelOptions {
  id: string;
  title?: string;
  onRequest?: () => void;
  onClose?: () => void;
}

/** Shared publication and summary UI. Link retrieval belongs to the caller. */
export function createSharePanel(options: SharePanelOptions) {
  const element = document.createElement("section");
  element.className = "share-screen";
  element.id = options.id;
  element.hidden = true;
  element.setAttribute("aria-label", options.title ? `Share link for ${options.title}` : "Share this poll");
  element.innerHTML = `
    <div class="share-link">
      <label>Public poll link</label>
      <div><input class="input input--code" readonly><button class="btn btn-primary copy-link" type="button" disabled>Copy link</button></div>
    </div>
    <div class="share-actions">
      <a class="btn btn-primary go-to-poll" hidden>Go to the poll</a>
      <a class="btn btn-secondary open-public-link" target="_blank" rel="noopener noreferrer" hidden>Open poll</a>
      <a class="btn btn-secondary open-history" hidden>History</a>
      <button class="btn btn-secondary share-retry" type="button" hidden>Try again</button>
      <button class="btn btn-ghost share-close" type="button" hidden>Close share panel</button>
    </div>
    <section class="link-security section-rule">
      <div><h2>Link security</h2><p>If the link was shared with the wrong people, replace it. The old link stops working immediately. Dates, responses and history are kept.</p></div>
      <button class="btn btn-secondary" type="button" disabled>Regenerate link…</button>
    </section>
    <p class="share-status" role="status" aria-live="polite"></p>
    <p class="share-error error" role="alert" hidden></p>`;
  const input = element.querySelector<HTMLInputElement>("input")!;
  input.id = `${options.id}-public-link`;
  element.querySelector("label")!.htmlFor = input.id;
  const copy = element.querySelector<HTMLButtonElement>(".copy-link")!;
  const open = element.querySelector<HTMLAnchorElement>(".open-public-link")!;
  const manage = element.querySelector<HTMLAnchorElement>(".go-to-poll")!;
  const history = element.querySelector<HTMLAnchorElement>(".open-history")!;
  const retry = element.querySelector<HTMLButtonElement>(".share-retry")!;
  const close = element.querySelector<HTMLButtonElement>(".share-close")!;
  const status = element.querySelector<HTMLElement>(".share-status")!;
  const error = element.querySelector<HTMLElement>(".share-error")!;
  let revision = 0;

  function setState(state: SharePanelState): void {
    if (state.status === "ready" && !ownedPollShareResponseSchema.safeParse({ publicUrl: state.publicUrl }).success) {
      state = { status: "error" };
    }
    revision += 1;
    element.setAttribute("aria-busy", String(state.status === "loading"));
    input.value = state.status === "ready" ? state.publicUrl : "";
    copy.disabled = state.status !== "ready";
    copy.textContent = "Copy link";
    open.hidden = state.status !== "ready";
    open.removeAttribute("href");
    if (state.status === "ready") open.href = state.publicUrl;
    retry.hidden = state.status !== "error" || !options.onRequest;
    error.hidden = state.status !== "error";
    error.textContent = state.status === "error" ? state.message ?? "We couldn't retrieve this poll's link. Try again." : "";
    status.textContent = state.status === "loading" ? "Loading the public poll link…"
      : state.status === "ready" ? "Public poll link ready."
      : state.status === "legacy" ? "The existing link cannot be recovered. Replacing it requires confirmation and will stop the old link working."
      : state.status === "idle" ? "Retrieve the current public link to share this poll." : "";
  }

  copy.addEventListener("click", () => {
    if (copy.disabled || !input.value) return;
    const current = revision;
    const link = input.value;
    copy.disabled = true;
    error.hidden = true;
    void (async () => {
      try {
        await navigator.clipboard.writeText(link);
        if (current !== revision) return;
        copy.textContent = "Copied ✓";
        status.textContent = "Public poll link copied.";
      } catch {
        if (current !== revision) return;
        status.textContent = "";
        error.hidden = false;
        error.textContent = "Copying failed. Select the public poll link and copy it manually.";
        input.focus();
        input.select();
      } finally {
        if (current === revision) copy.disabled = false;
      }
    })();
  });
  retry.addEventListener("click", () => options.onRequest?.());
  close.hidden = !options.onClose;
  close.addEventListener("click", () => options.onClose?.());
  setState({ status: "idle" });
  return { element, input, manage, history, open, setState };
}
import { ownedPollShareResponseSchema } from "@invite-a-gent/contracts";

