import path from "node:path";
import { fileURLToPath } from "node:url";
import { DescribeTableCommand, DynamoDBClient, ListTablesCommand } from "@aws-sdk/client-dynamodb";
import { validateLocalEndpoint } from "./cleanup-local-data.mjs";
import { deleteOwnedTable } from "./smoke-run-resources.mjs";

const confirmation = "DELETE ALL LOCAL DATA";
const sharedNames = ["invite-agent-local-app", "invite-agent-local-audit"];
const smokeName = /^invite-agent-smoke-(app|audit)-\d{8}t\d{9}z-[a-f0-9]{32}$/;
const testName = /^invite-agent-test-(app|audit)-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const exclusions = [
  "Unsupported/custom table names, including legacy non-UUID test names",
  "All files: .dynamodb/, .devstack/, reports, configuration, source and backups",
  "Browser storage and processes"
];
const warning = "Irreversible: deletes entire supported tables, indexes and audit history. Stop all writers first. No backup or rollback.";

export function tableCategory(name) {
  if (sharedNames.includes(name)) return "shared-local";
  if (smokeName.test(name)) return "smoke-run";
  if (testName.test(name)) return "integration-test";
  return undefined;
}

export function readOptions(argv, env) {
  const flags = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (!["--endpoint", "--confirm", "--force", "--dry-run", "--help"].includes(flag)) {
      throw new Error(`Unknown argument: ${flag}`);
    }
    if (flags.has(flag)) throw new Error(`Duplicate argument: ${flag}`);
    let value = true;
    if (["--endpoint", "--confirm"].includes(flag)) {
      value = argv[++index];
      if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);
    }
    flags.set(flag, value);
  }
  if (flags.has("--help")) {
    if (flags.size !== 1) throw new Error("--help must be used alone");
    return { help: true };
  }
  if (["--dry-run", "--force", "--confirm"].filter((flag) => flags.has(flag)).length > 1) {
    throw new Error("--dry-run, --confirm and --force cannot be used together");
  }
  if (flags.has("--confirm") && flags.get("--confirm") !== confirmation) {
    throw new Error(`--confirm requires the exact phrase: ${confirmation}`);
  }
  if (!["local", "test"].includes(env.APP_ENV)) throw new Error("APP_ENV must explicitly be local or test");
  for (const [index, variable] of ["APP_TABLE_NAME", "AUDIT_TABLE_NAME"].entries()) {
    if (env[variable] !== undefined && env[variable] !== sharedNames[index]) {
      throw new Error(`${variable} must be unset or ${sharedNames[index]}; custom names are excluded`);
    }
  }
  const raw = flags.get("--endpoint") ?? env.DYNAMODB_ENDPOINT;
  // Reject URL parser aliases (e.g. 127.1 or decimal IPv4) before shared validation.
  const match = typeof raw === "string" && /^http:\/\/(127\.0\.0\.1|localhost):([1-9]\d{0,4})\/?$/.exec(raw);
  if (!match || Number(match[2]) > 65535) throw new Error("An explicit loopback HTTP endpoint with port 1-65535 is required");
  validateLocalEndpoint(raw);
  return { endpoint: `http://127.0.0.1:${match[2]}`, dryRun: !flags.has("--force") && !flags.has("--confirm") };
}

function createLocalClient(endpoint) {
  return new DynamoDBClient({
    endpoint, region: "eu-west-2", credentials: { accessKeyId: "local", secretAccessKey: "local" },
    maxAttempts: 2, requestHandler: { connectionTimeout: 2000, requestTimeout: 5000 }
  });
}

function identity(table) {
  const keys = table?.KeySchema ?? [];
  if (table?.TableStatus !== "ACTIVE" || keys.length !== 2 ||
      !keys.some((key) => key.AttributeName === "PK" && key.KeyType === "HASH") ||
      !keys.some((key) => key.AttributeName === "SK" && key.KeyType === "RANGE") ||
      !["PK", "SK"].every((name) => table.AttributeDefinitions?.some((attribute) =>
        attribute.AttributeName === name && attribute.AttributeType === "S"))) {
    throw new Error("Refusing table: expected ACTIVE state and string PK/SK schema");
  }
  const created = table.CreationDateTime?.getTime();
  if (!Number.isFinite(created)) throw new Error("Refusing table: missing creation identity");
  return `${table.TableId ?? ""}:${created}`;
}

const missing = (error) => error?.name === "ResourceNotFoundException";
const summary = (tables) => Object.fromEntries(["ready", "deleted", "skipped", "failed"].map((status) =>
  [status, tables.filter((table) => table.status === status).length]));

export async function clearAllLocalData({ argv, env, createClient = createLocalClient, emit = () => {} }) {
  const options = readOptions(argv, env);
  if (options.help) return { help: true };
  const client = createClient(options.endpoint);
  const report = {
    phase: "preview", ...options, warning, exclusions, tables: [], status: "complete"
  };
  const identities = new Map();
  try {
    const names = new Set();
    let cursor;
    const cursors = new Set();
    try {
      do {
        const page = await client.send(new ListTablesCommand({ ExclusiveStartTableName: cursor }));
        if (!Array.isArray(page.TableNames) || page.TableNames.some((name) => typeof name !== "string")) {
          throw new Error("Malformed ListTables response");
        }
        for (const name of page.TableNames) names.add(name);
        cursor = page.LastEvaluatedTableName;
        if (cursor && (typeof cursor !== "string" || cursors.has(cursor))) throw new Error("Invalid discovery pagination cursor");
        if (cursor) cursors.add(cursor);
      } while (cursor);
    } catch (error) {
      report.status = "failed";
      report.error = `Discovery failed; no tables deleted: ${error.message}`;
    }
    for (const name of [...new Set([...names, ...sharedNames])].sort()) {
      const category = tableCategory(name);
      const table = { name, category: category ?? "excluded", action: category ? "delete-table" : "none", status: "skipped" };
      report.tables.push(table);
      if (!category) { table.reason = "Unsupported table name"; continue; }
      if (!names.has(name)) { table.reason = "Already absent"; continue; }
      try {
        const result = await client.send(new DescribeTableCommand({ TableName: name }));
        identities.set(name, identity(result.Table));
        table.status = "ready";
      } catch (error) {
        table.status = missing(error) ? "skipped" : "failed";
        table.reason = missing(error) ? "Already absent" : error.message;
      }
    }
    if (report.tables.some((table) => table.status === "failed")) report.status = "failed";
    report.summary = summary(report.tables);
    // Await successful preview output before permitting any writes.
    await emit(structuredClone(report));
    if (options.dryRun || report.status === "failed") return report;

    report.phase = "result";
    for (const table of report.tables) {
      if (table.status !== "ready") continue;
      try {
        const current = await client.send(new DescribeTableCommand({ TableName: table.name }));
        if (identity(current.Table) !== identities.get(table.name)) throw new Error("Refusing replacement table: creation identity changed since preview");
        await deleteOwnedTable(client, table.name);
        table.status = "deleted";
      } catch (error) {
        table.status = missing(error) ? "skipped" : "failed";
        table.reason = missing(error) ? "Already absent" : error.message;
      }
    }
    report.summary = summary(report.tables);
    report.status = report.summary.failed ? "failed" : "complete";
    await emit(structuredClone(report));
    return report;
  } finally { client.destroy(); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const report = await clearAllLocalData({
      argv: process.argv.slice(2), env: process.env,
      emit: (value) => new Promise((resolve, reject) => process.stdout.write(`${JSON.stringify(value)}\n`, (error) => error ? reject(error) : resolve()))
    });
    if (report.help) process.stdout.write(`Usage: APP_ENV=local node scripts/clear-all-local-data.mjs --endpoint http://127.0.0.1:18000 [--dry-run | --confirm "${confirmation}" | --force]\n${warning}\n`);
    if (report.status === "failed") process.exitCode = 1;
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
