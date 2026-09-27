import "./styles.css";

const app = document.querySelector<HTMLElement>("#app");

if (!app) {
  throw new Error("Application root is missing");
}

app.innerHTML = `
  <section class="shell" aria-labelledby="product-title">
    <p class="eyebrow">Plans, without the group-chat archaeology</p>
    <h1 id="product-title">Invite-a-Gent</h1>
    <p class="lede">Find the date that works for everyone.</p>
    <div class="health" role="status" aria-live="polite">
      <span class="health__dot" aria-hidden="true"></span>
      <span data-testid="api-health">Checking API…</span>
    </div>
  </section>
`;

const health = app.querySelector<HTMLElement>("[data-testid='api-health']");

async function checkApi(): Promise<void> {
  try {
    const response = await fetch("/health", { headers: { accept: "application/json" } });
    const body: unknown = await response.json();
    if (!response.ok || !isHealthy(body)) {
      throw new Error("API health check failed");
    }
    if (health) {
      health.textContent = "API healthy";
      health.parentElement?.classList.add("health--ready");
    }
  } catch {
    if (health) {
      health.textContent = "API unavailable";
      health.parentElement?.classList.add("health--failed");
    }
  }
}

function isHealthy(value: unknown): value is { status: "ok" } {
  return (
    typeof value === "object" &&
    value !== null &&
    "status" in value &&
    value.status === "ok"
  );
}

void checkApi();
