import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { validCreatePollRequest } from "../fixtures/contracts.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const domainUrl = pathToFileURL(path.join(repositoryRoot, "backend/dist/domain/index.js")).href;

async function loadDomain() {
  return import(domainUrl);
}

test("location Markdown accepts the documented subset and emits sanitised HTML", async () => {
  const { renderSafeLocationMarkdown, validateDraftPoll } = await loadDomain();
  const location = [
    "Meet at **Community Hall** — [map](https://example.test/map?q=one&floor=2)",
    "",
    "- Step-free entrance",
    "- Ask for *Olivia*"
  ].join("\n");
  const input = { ...validCreatePollRequest, location };

  assert.deepEqual(validateDraftPoll(input), { success: true, data: input });
  assert.equal(
    renderSafeLocationMarkdown(location),
    '<p>Meet at <strong>Community Hall</strong> — <a href="https://example.test/map?q=one&amp;floor=2" rel="noopener noreferrer" target="_blank">map</a></p><ul><li>Step-free entrance</li><li>Ask for <em>Olivia</em></li></ul>'
  );
});

test("location validation counts Unicode code points rather than UTF-16 units", async () => {
  const { validateDraftPoll } = await loadDomain();
  const accepted = { ...validCreatePollRequest, location: "😀".repeat(4_000) };
  const rejected = { ...validCreatePollRequest, location: "😀".repeat(4_001) };

  assert.equal(validateDraftPoll(accepted).success, true);
  const result = validateDraftPoll(rejected);
  assert.equal(result.success, false);
  assert.equal(result.input, rejected, "recoverable input is preserved by reference");
  assert.deepEqual(result.issues.map(({ code }) => code), ["LOCATION_TOO_LONG"]);
});

test("unsafe, executable, and unsupported location content is rejected", async () => {
  const { validateDraftPoll } = await loadDomain();
  const examples = [
    ["<script>alert(1)</script>", "LOCATION_HTML_NOT_ALLOWED"],
    ["<img src=x onerror=alert(1)>", "LOCATION_HTML_NOT_ALLOWED"],
    ["[click](javascript:alert(1))", "LOCATION_LINK_UNSAFE"],
    ["[mail](mailto:venue@example.test)", "LOCATION_LINK_UNSAFE"],
    ["[plain](http://example.test)", "LOCATION_LINK_UNSAFE"],
    ["[broken](https://example.test", "LOCATION_MARKDOWN_INVALID"],
    ["# Heading", "LOCATION_MARKDOWN_INVALID"]
  ];

  for (const [location, expectedCode] of examples) {
    const input = { ...validCreatePollRequest, location };
    const result = validateDraftPoll(input);
    assert.equal(result.success, false, location);
    assert.equal(result.input, input);
    assert.deepEqual(result.issues.map(({ code }) => code), [expectedCode]);
  }
});

test("plain location text is HTML-escaped before rendering", async () => {
  const { renderSafeLocationMarkdown } = await loadDomain();
  assert.equal(
    renderSafeLocationMarkdown("Community & Riverside"),
    "<p>Community &amp; Riverside</p>"
  );
});
