export type SharePanelState =
  | { status: "idle" | "loading" }
  | { status: "ready"; publicUrl: string; message?: string | undefined }
  | { status: "error"; message?: string | undefined }
  | { status: "legacy" }
  | { status: "rotating" };

export interface SharePanelOptions {
  id: string;
  onRequest?: () => void;
  onRotate?: () => void;
}

/** Owner poll-page UI. Secure link retrieval belongs to the caller. */
export function createSharePanel(options: SharePanelOptions) {
  const element = document.createElement("section");
  element.className = "share-screen";
  element.id = options.id;
  element.hidden = true;
  element.setAttribute("aria-label", "Share poll");
  element.innerHTML = `
    <div class="share-title"><h2>Share poll</h2><p>Send this link to the people you want to take part.</p></div>
    <div class="share-link">
      <label>Public poll link</label>
      <div><input class="input input--code" readonly><button class="btn btn-primary copy-link" type="button" disabled>Copy link</button></div>
    </div>
    <div class="share-actions">
      <a class="btn btn-secondary open-public-link" target="_blank" rel="noopener noreferrer" hidden>Open as a participant</a>
      <button class="btn btn-secondary share-retry" type="button" hidden>Try again</button>
    </div>
    <section class="link-security section-rule">
      <div><h2>Link security</h2><p>If the link was shared with the wrong people, replace it. The old link stops working immediately. Dates, responses and history are kept.</p></div>
      <button class="btn btn-secondary regenerate-link" type="button" disabled>Regenerate link</button>
    </section>
    <dialog class="rotation-confirmation" aria-label="Regenerate public link">
      <h2>Regenerate public link?</h2>
      <p>Regenerate this poll's public link? The current link will stop working immediately. Anyone using it will need the new link. Continue only if you are ready to share the replacement.</p>
      <div class="rotation-confirmation-actions">
        <button class="btn btn-secondary rotation-cancel" type="button">Cancel</button>
        <button class="btn btn-primary rotation-confirm" type="button">Regenerate link</button>
      </div>
    </dialog>
    <p class="share-status" role="status" aria-live="polite"></p>
    <p class="share-error error" role="alert" hidden></p>`;
  const input = element.querySelector<HTMLInputElement>("input")!;
  input.id = `${options.id}-public-link`;
  element.querySelector("label")!.htmlFor = input.id;
  const copy = element.querySelector<HTMLButtonElement>(".copy-link")!;
  const open = element.querySelector<HTMLAnchorElement>(".open-public-link")!;
  const retry = element.querySelector<HTMLButtonElement>(".share-retry")!;
  const status = element.querySelector<HTMLElement>(".share-status")!;
  const error = element.querySelector<HTMLElement>(".share-error")!;
  const regenerate = element.querySelector<HTMLButtonElement>(".regenerate-link")!;
  const confirmation = element.querySelector<HTMLDialogElement>(".rotation-confirmation")!;
  let revision = 0;

  function setState(state: SharePanelState): void {
    if (state.status === "ready" && !ownedPollShareResponseSchema.safeParse({ publicUrl: state.publicUrl }).success) {
      state = { status: "error" };
    }
    revision += 1;
    element.setAttribute("aria-busy", String(state.status === "loading" || state.status === "rotating"));
    input.value = state.status === "ready" ? state.publicUrl : "";
    copy.disabled = state.status !== "ready";
    copy.textContent = "Copy link";
    open.hidden = state.status !== "ready";
    open.removeAttribute("href");
    if (state.status === "ready") open.href = state.publicUrl;
    retry.hidden = state.status !== "error" || !options.onRequest;
    regenerate.disabled = !options.onRotate || !["ready", "legacy"].includes(state.status);
    error.hidden = state.status !== "error";
    error.textContent = state.status === "error" ? state.message ?? "We couldn't retrieve this poll's link. Try again." : "";
    status.textContent = state.status === "loading" ? "Loading the public poll link…"
      : state.status === "ready" ? state.message ?? "Public poll link ready."
      : state.status === "legacy" ? "The existing link cannot be recovered. Replacing it requires confirmation and will stop the old link working."
      : state.status === "rotating" ? "Regenerating the public link…"
      : state.status === "idle" ? "Retrieve the current public link to share this poll." : "";
  }

  regenerate.addEventListener("click", () => { if (!regenerate.disabled) confirmation.showModal(); });
  confirmation.querySelector(".rotation-cancel")!.addEventListener("click", () => confirmation.close());
  confirmation.querySelector(".rotation-confirm")!.addEventListener("click", () => {
    confirmation.close();
    setState({ status: "rotating" });
    options.onRotate?.();
  });
  confirmation.addEventListener("click", (event) => { if (event.target === confirmation) confirmation.close(); });

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
  setState({ status: "idle" });
  return { element, input, open, setState, dismissConfirmation: () => confirmation.close() };
}
import { ownedPollShareResponseSchema } from "@invite-a-gent/contracts";

