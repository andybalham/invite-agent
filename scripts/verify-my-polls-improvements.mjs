import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

// T-167: one focused gate for the complete improvement and its discovery,
// lifecycle, navigation and public-capability regressions. DynamoDB Local must
// already be reachable; fixtures and the E2E coordinator own disposable tables.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
if (process.env.E2E_ALLOW_SHARED_TABLES === "1" || process.env.SMOKE_RUN_MANIFEST_PATH) {
  throw new Error("My polls improvement acceptance requires a fresh isolated E2E run; unset E2E_ALLOW_SHARED_TABLES/SMOKE_RUN_MANIFEST_PATH");
}

const stages = [
  ["Build", ["node_modules/typescript/bin/tsc", "-b", "--pretty", "false"]],
  ["Summary, discovery, lifecycle and sharing contracts", ["--test",
    "test/foundation/compact-date-summary.test.mjs",
    "test/foundation/my-polls-contracts.test.mjs", "test/foundation/my-polls-query.test.mjs",
    "test/foundation/my-polls-cursor.test.mjs", "test/foundation/my-polls-creation.test.mjs",
    "test/foundation/my-polls-persistence.test.mjs", "test/foundation/my-polls-lifecycle.test.mjs",
    "test/foundation/owner-share-contracts.test.mjs", "test/foundation/owner-share-regression.test.mjs",
    "test/foundation/recoverable-publication.test.mjs", "test/foundation/public-link-rotation.test.mjs",
    "test/foundation/publication-security.test.mjs"]],
  ["Responsive summaries, loading, search and navigation components", ["--test", "--test-concurrency=1",
    "test/component/my-polls-dashboard.test.mjs", "test/component/my-polls-summary.test.mjs",
    "test/component/my-polls-compact-dates.test.mjs", "test/component/my-polls-loading.test.mjs",
    "test/component/my-polls-search.test.mjs", "test/component/my-polls-lifecycle.test.mjs",
    "test/component/organiser-navigation.test.mjs", "test/component/my-polls-share.test.mjs",
    "test/component/poll-page-share.test.mjs"]],
  ["Isolated HTTP, persistence, lifecycle and public-link integration", ["--test", "--test-concurrency=1",
    "test/integration/my-polls-api.test.mjs", "test/integration/my-polls-repository.test.mjs",
    "test/integration/my-polls-fixture.test.mjs", "test/integration/my-polls-lifecycle.test.mjs",
    "test/integration/poll-page-share.test.mjs", "test/integration/publication.test.mjs",
    "test/integration/public-link-rotation.test.mjs", "test/integration/organiser-authorization.test.mjs"]],
  ["Live improvement journey and dashboard regressions", ["node_modules/@playwright/test/cli.js", "test",
    "test/e2e/my-polls-improvements.spec.ts", "test/e2e/my-polls-compact-dates.spec.ts",
    "test/e2e/poll-page-share.spec.ts", "test/e2e/organiser-navigation.spec.ts",
    "test/e2e/navigation-guards.spec.ts", "test/e2e/my-polls-search.spec.ts",
    "test/e2e/my-polls-lifecycle.spec.ts", "--project=chromium", "--workers=1", "--retries=0"]]
];

for (const [name, args] of stages) {
  process.stdout.write(`\n${name}\n`);
  const result = spawnSync(process.execPath, args, { cwd: root, stdio: "inherit", windowsHide: true });
  if (result.error || result.status !== 0) {
    process.stderr.write(`My polls improvement acceptance failed at: ${name}\n${result.error?.message ?? result.signal ?? `exit ${result.status}`}\n`);
    process.exitCode = result.status || 1;
    break;
  }
}
