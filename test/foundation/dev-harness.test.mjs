import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

async function read(relativePath) {
  return readFile(path.join(root, relativePath), "utf8");
}

test("the local stack exposes one-command readiness-based start and scoped stop scripts", async () => {
  const [start, stop, rootPackage] = await Promise.all([
    read("scripts/Start-DevStack.ps1"),
    read("scripts/Stop-DevStack.ps1"),
    read("package.json").then(JSON.parse)
  ]);

  assert.match(rootPackage.scripts.dev, /Start-DevStack\.ps1/);
  assert.match(rootPackage.scripts["dev:stop"], /Stop-DevStack\.ps1/);
  assert.match(start, /DYNAMODB_PORT[\s\S]*18000/);
  assert.match(start, /API_PORT[\s\S]*14000/);
  assert.match(start, /WEB_PORT[\s\S]*15173/);
  assert.match(start, /Wait-ForTcpPort[\s\S]*\$DynamoDbPort/);
  assert.match(start, /Wait-ForHttp[\s\S]*\$ApiPort\/health/);
  assert.match(start, /Wait-ForHttp[\s\S]*\$WebPort/);
  assert.match(start, /processes\.json/);
  assert.match(stop, /processes\.json/);
  assert.doesNotMatch(stop, /Get-Process\s+node|taskkill\s+\/IM|Stop-Process\s+-Name/i);
});

test("the Vite shell renders the product name and observable API health", async () => {
  const [html, main, viteConfig] = await Promise.all([
    read("frontend/index.html"),
    read("frontend/src/main.ts"),
    read("frontend/vite.config.ts")
  ]);

  assert.match(html, /<main[^>]+id="app"/);
  assert.match(main, /Invite-a-Gent/);
  assert.match(main, /\/health/);
  assert.match(main, /data-testid=["'`]api-health["'`]/);
  assert.match(viteConfig, /process\.env\.API_PORT/);
  assert.match(viteConfig, /14000/);
});

test("Playwright isolates each run and retains browser, API, and service diagnostics", async () => {
  const [config, fixture, workflow] = await Promise.all([
    read("playwright.config.ts"),
    read("test/e2e/fixtures.ts"),
    read(".github/workflows/foundation.yml")
  ]);

  assert.match(config, /trace:\s*["']retain-on-failure["']/);
  assert.match(config, /screenshot:\s*["']only-on-failure["']/);
  assert.match(config, /outputDir/);
  assert.match(fixture, /testRunId/);
  assert.match(fixture, /api\.log/);
  assert.match(fixture, /service-logs/);
  assert.match(workflow, /test:foundation/);
  assert.match(workflow, /if:\s*always\(\)/);
  assert.match(workflow, /dev:stop/);
  assert.match(workflow, /playwright-report|test-results|service-logs/);
});
