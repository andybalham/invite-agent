import { spawnSync } from "node:child_process";

// Requires the normal local stack. Preserve its endpoint/table/port environment;
// API fixtures own disposable tables and browser cases use fresh organiser identities.
const stages = [
  ["Build", ["node_modules/typescript/bin/tsc", "-b", "--pretty", "false"]],
  ["Pure discovery rules and contracts", ["--test",
    "test/foundation/my-polls-query.test.mjs", "test/foundation/my-polls-contracts.test.mjs",
    "test/foundation/my-polls-creation.test.mjs", "test/foundation/my-polls-cursor.test.mjs"]],
  ["Frontend query and accessibility contracts", ["--test", "test/component/my-polls-search.test.mjs"]],
  ["HTTP and persistence discovery", ["--test", "--test-concurrency=1", "test/integration/my-polls-api.test.mjs",
    "test/integration/my-polls-repository.test.mjs", "test/integration/my-polls-fixture.test.mjs"]],
  ["Live desktop/mobile discovery", ["node_modules/@playwright/test/cli.js", "test",
    "test/e2e/my-polls-search.spec.ts", "--project=chromium", "--workers=1", "--retries=0"]]
];

for (const [name, args] of stages) {
  process.stdout.write(`\n${name}\n`);
  const result = spawnSync(process.execPath, args, { stdio: "inherit" });
  if (result.error) process.stderr.write(`${result.error.message}\n`);
  if (result.error || result.status !== 0) {
    process.exitCode = result.status || 1;
    break;
  }
}
