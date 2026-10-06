import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { DynamoDBClient, GetItemCommand, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { expect, test } from "./fixtures";

// Opt-in verification of the runner itself, excluded from ordinary regression.
test("cleanup removes UI-created and untracked fixture records in every attempt", async ({ page, e2eConfiguration, testRunId }, testInfo) => {
  const mode = process.env.HARNESS_CLEANUP_PROBE;
  test.skip(!mode, "runner cleanup verification only");
  await page.goto(`/?view=create&testRunId=${encodeURIComponent(testRunId)}`);
  await page.getByRole("textbox", { name: "Title", exact: true }).fill("Cleanup isolation verification");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByRole("status")).toContainText("Draft saved");
  const pollId = new URL(page.url()).searchParams.get("pollId");
  expect(pollId).toMatch(/^[a-f0-9-]{36}$/);
  const client = new DynamoDBClient({ endpoint: e2eConfiguration.endpoint, region: e2eConfiguration.region,
    credentials: { accessKeyId: "local", secretAccessKey: "local" }, maxAttempts: 1 });
  try {
    const untracked = randomUUID();
    const app = e2eConfiguration.appTableName;
    const audit = e2eConfiguration.auditTableName;
    // Deliberately absent from manifest.pollIds: cleanup owns the whole pair.
    const records = [
      { table: app, pk: `POLL#${untracked}`, sk: "PARTICIPANT#fixture" },
      { table: app, pk: `POLL#${untracked}`, sk: "NAME#fixture" },
      { table: app, pk: `TOKEN#${untracked}`, sk: "METADATA" },
      { table: audit, pk: `POLL#${untracked}`, sk: "EVENT#fixture" }
    ];
    for (const { table, pk, sk } of records) {
      const item = { PK: { S: pk }, SK: { S: sk }, document: { S: "untracked cleanup fixture" } };
      await client.send(new PutItemCommand({ TableName: table, Item: item }));
      const result = await client.send(new GetItemCommand({ TableName: table, Key: { PK: item.PK, SK: item.SK }, ConsistentRead: true }));
      expect(result.Item).toEqual(item);
    }
    const metadata = await client.send(new GetItemCommand({ TableName: app, Key: { PK: { S: `POLL#${pollId}` }, SK: { S: "METADATA" } }, ConsistentRead: true }));
    expect(metadata.Item?.GSI1PK?.S).toBeTruthy();
    await writeFile(testInfo.outputPath(`poll-${pollId}.json`), JSON.stringify({ pollId }));
    await testInfo.attach("cleanup-records", { body: JSON.stringify({ pollId, untracked, retry: testInfo.retry, worker: testInfo.workerIndex,
      runId: e2eConfiguration.runId, app, audit }), contentType: "application/json" });
  } finally { client.destroy(); }
  if (mode === "timeout") {
    testInfo.setTimeout(testInfo.duration + 2000);
    await page.waitForTimeout(30_000);
  }
  if (mode === "failure" || (mode === "retry" && testInfo.retry === 0)) expect("recorded fixture").toBe("intentional cleanup probe failure");
});
