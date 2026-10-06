import { DeleteTableCommand, DescribeTableCommand, GetItemCommand, type DynamoDBClient, type TableDescription } from "@aws-sdk/client-dynamodb";
import { setTimeout as delay } from "node:timers/promises";
import { assertTableSchema, saveE2EManifest, validateE2EManifest, type CleanupAttempt, type E2EManifest, type E2ETable } from "./e2e-resources.js";

function identityOf(table: TableDescription | undefined) {
  if (!table?.CreationDateTime || !Number.isFinite(table.CreationDateTime.getTime())) throw new Error("Missing creation identity");
  return { creationDateTime: table.CreationDateTime.getTime(), ...(table.TableId ? { tableId: table.TableId } : {}) };
}

function sameIdentity(table: E2ETable, live: TableDescription | undefined): void {
  const identity = identityOf(live);
  if (table.creationIdentity && (identity.creationDateTime !== table.creationIdentity.creationDateTime || identity.tableId !== table.creationIdentity.tableId)) {
    throw new Error(`Creation identity mismatch: ${table.name}; investigate replacement, do not delete`);
  }
}

export async function inspectE2ETable(client: DynamoDBClient, manifest: E2EManifest, table: E2ETable) {
  validateE2EManifest(manifest);
  let live: TableDescription | undefined;
  try { live = (await client.send(new DescribeTableCommand({ TableName: table.name }))).Table; }
  catch (error) { if ((error as Error).name === "ResourceNotFoundException") return { state: "absent" as const, identity: null }; throw error; }
  if (["deleted", "absent"].includes(table.cleanup) || !table.creationAttempted) throw new Error(`Replacement/conflict at ${table.name}; prior cleanup or no creation intent forbids deletion`);
  sameIdentity(table, live);
  if (live?.TableStatus === "DELETING") {
    if (!table.deletionAttempted || !table.deletionRequestedAt || !table.creationIdentity || !table.owned) throw new Error(`Unproven deletion in progress: ${table.name}; investigate ownership`);
    return { state: "deleting" as const, identity: identityOf(live) };
  }
  const identity = assertTableSchema(live, table.role);
  const { Item } = await client.send(new GetItemCommand({ TableName: table.name, Key: { PK: { S: "E2E_RUN#OWNERSHIP" }, SK: { S: "METADATA" } }, ConsistentRead: true }));
  const expected = { PK: "E2E_RUN#OWNERSHIP", SK: "METADATA", owner: manifest.owner, runId: manifest.runId, nonce: manifest.ownershipNonce, role: table.role };
  if (!Item || Object.entries(expected).some(([key, value]) => Item[key]?.S !== value)) throw new Error(`Ownership marker mismatch: ${table.name}; investigate marker, never repair it during cleanup`);
  return { state: "eligible" as const, identity };
}

async function waitForAbsence(client: DynamoDBClient, table: E2ETable, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    let live;
    try { live = (await client.send(new DescribeTableCommand({ TableName: table.name }))).Table; }
    catch (error) { if ((error as Error).name === "ResourceNotFoundException") return; throw error; }
    sameIdentity(table, live);
    if (live?.TableStatus !== "DELETING") throw new Error(`Deletion not confirmed: ${table.name}; retry with fresh ownership validation`);
    if (Date.now() >= deadline) throw new Error(`Timed out waiting for ${table.name}; restore connectivity and retry selected-run recovery`);
    await delay(Math.min(100, Math.max(1, deadline - Date.now())));
  }
}

// The coordinator/recovery lock holder is the sole journal writer. Intent must
// reach disk before every destructive call; each independent result is saved.
export async function cleanupE2ETables(file: string, manifest: E2EManifest, client: DynamoDBClient, attempt: CleanupAttempt, timeoutMs = 5000): Promise<void> {
  validateE2EManifest(manifest);
  for (const table of manifest.tables) {
    const result = { role: table.role, name: table.name, observation: "unknown", error: null as string | null };
    attempt.tables.push(result);
    try {
      const inspected = await inspectE2ETable(client, manifest, table);
      result.observation = inspected.state;
      if (inspected.state === "absent") {
        if (table.creationAttempted && !["deleted", "absent"].includes(table.cleanup)) table.cleanup = table.deletionAttempted ? "deleted" : "absent";
      } else {
        if (inspected.state === "eligible") {
          table.creationIdentity = inspected.identity;
          table.owned = true;
          table.deletionAttempted = true;
          table.deletionRequestedAt = new Date().toISOString();
          await saveE2EManifest(file, manifest);
          // Recheck live ownership after persistence, immediately before delete.
          const current = await inspectE2ETable(client, manifest, table);
          if (current.state === "eligible") await client.send(new DeleteTableCommand({ TableName: table.name }));
        }
        await waitForAbsence(client, table, timeoutMs);
        table.cleanup = "deleted";
        result.observation = "deleted";
      }
      table.cleanupError = null;
    } catch (error) {
      const cause = error as Error;
      result.error = `${table.role} ${table.name}: inspect/delete/confirm ${cause.name}: ${cause.message}. Retry only this manifest after restoring connectivity or investigating ownership.`;
      if (!["deleted", "absent"].includes(table.cleanup)) table.cleanup = "failed";
      table.cleanupError = result.error;
      attempt.phases.tables.push(result.error);
    }
    try { await saveE2EManifest(file, manifest); }
    catch (error) { attempt.phases.tables.push(`Persist ${table.name}: ${(error as Error).message}`); }
  }
}
