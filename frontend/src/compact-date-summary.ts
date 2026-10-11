const previewLimit = 3;
const inlineLimit = 8;
let disclosureId = 0;

function dateList(dates: readonly string[]): HTMLUListElement {
  const list = document.createElement("ul");
  list.className = "my-polls-dates";
  for (const date of dates) {
    const item = document.createElement("li");
    item.textContent = date;
    list.append(item);
  }
  return list;
}

/** Each render path owns its disclosure, including its IDs and initiating focus. */
export function createCompactDateSummary(title: string, dates: readonly string[], dialogHost: HTMLElement, finalDate?: string): HTMLElement {
  const summary = document.createElement("div");
  summary.className = "my-polls-date-summary";
  const count = document.createElement("p");
  count.className = "my-polls-date-count";
  count.textContent = `${dates.length} proposed ${dates.length === 1 ? "date" : "dates"}`;
  summary.append(count);
  if (finalDate) {
    const final = document.createElement("p");
    final.className = "my-polls-final-date";
    final.textContent = `Final date: ${finalDate}`;
    summary.append(final);
  }
  if (dates.length) summary.append(dateList(dates.slice(0, previewLimit)));
  else {
    const empty = document.createElement("p");
    empty.className = "my-polls-date-empty";
    empty.textContent = "No dates proposed";
    summary.append(empty);
  }
  if (dates.length <= previewLimit) return summary;

  const id = `proposed-dates-${++disclosureId}`;
  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "btn btn-secondary my-polls-date-toggle";
  trigger.textContent = "Show dates";
  trigger.setAttribute("aria-expanded", "false");
  trigger.setAttribute("aria-controls", id);
  const fullList = dateList(dates);
  fullList.classList.add("my-polls-dates--full");
  summary.append(trigger);

  if (dates.length <= inlineLimit) {
    const region = document.createElement("div");
    region.id = id;
    region.className = "my-polls-date-details";
    region.hidden = true;
    region.setAttribute("role", "region");
    region.setAttribute("aria-label", `Proposed dates for ${title}`);
    region.append(fullList);
    trigger.addEventListener("click", () => {
      region.hidden = !region.hidden;
      trigger.setAttribute("aria-expanded", String(!region.hidden));
      trigger.textContent = region.hidden ? "Show dates" : "Hide dates";
    });
    summary.append(region);
  } else {
    const dialog = document.createElement("dialog");
    dialog.id = id;
    dialog.className = "dialog my-polls-date-dialog";
    const heading = document.createElement("h2");
    heading.id = `${id}-heading`;
    heading.textContent = `Proposed dates for ${title}`;
    dialog.setAttribute("aria-labelledby", heading.id);
    trigger.setAttribute("aria-haspopup", "dialog");
    // The complete scrollable list is a keyboard stop as well as the close button.
    fullList.tabIndex = 0;
    fullList.setAttribute("aria-label", `All ${dates.length} proposed dates`);
    const close = document.createElement("button");
    close.type = "button";
    close.className = "btn btn-secondary";
    close.textContent = "Close dates";
    close.addEventListener("click", () => dialog.close());
    dialog.addEventListener("keydown", (event) => {
      if (event.key !== "Tab") return;
      event.preventDefault();
      if (document.activeElement === close) fullList.focus();
      else close.focus();
    });
    dialog.addEventListener("close", () => {
      trigger.setAttribute("aria-expanded", "false");
      if (trigger.isConnected) trigger.focus();
    });
    trigger.addEventListener("click", () => {
      dialog.showModal();
      trigger.setAttribute("aria-expanded", "true");
      close.focus();
    });
    dialog.append(heading, count.cloneNode(true), fullList, close);
    dialogHost.append(dialog);
  }
  return summary;
}
