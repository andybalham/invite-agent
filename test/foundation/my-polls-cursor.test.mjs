import assert from "node:assert/strict";
import test from "node:test";
import { createHmac } from "node:crypto";
import { OwnedPollCursor } from "../../backend/dist/security/owned-poll-cursor.js";
import { PollService } from "../../backend/dist/application/poll-service.js";

const secret = "a-long-test-secret-for-dashboard-cursors";
const query = { filter: "active", search: "", pageSize: 25 };
const key = { PK: { S: "POLL#p" }, SK: { S: "METADATA" }, GSI1PK: { S: "ORGANISER#owner" }, GSI1SK: { S: "POLL#2026-01-01T00:00:00.000Z#p" } };

test("cursor is canonical, expires after 15 minutes and rejects signed invalid index keys", () => {
  let now = 1000000;
  const codec = new OwnedPollCursor(secret, () => now);
  const cursor = codec.sign("owner", query, key);
  assert.deepEqual(codec.verify(cursor, "owner", query), key);
  const [version, payload, signature] = cursor.split(".");
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  const noncanonical = signature.slice(0, -1) + alphabet[alphabet.indexOf(signature.at(-1)) + 1];
  assert.throws(() => codec.verify(`${version}.${payload}.${noncanonical}`, "owner", query), { code: "VALIDATION_ERROR" });
  for (const badKey of [{ ...key, PK: { S: "POLL#different" } }, { ...key, SK: { S: "PARTICIPANT#p" } },
    { ...key, extra: { S: "foreign" } }, { ...key, GSI1SK: { S: "POLL#2026-02-31T00:00:00.000Z#p" } }]) {
    const encoded = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(payload, "base64url")), key: badKey })).toString("base64url");
    const mac = createHmac("sha256", secret).update(`v1.${encoded}`).digest("base64url");
    assert.throws(() => codec.verify(`v1.${encoded}.${mac}`, "owner", query), { code: "VALIDATION_ERROR" });
  }
  now += 15 * 60 * 1000;
  assert.throws(() => codec.verify(cursor, "owner", query), { code: "VALIDATION_ERROR" });
  assert.throws(() => new OwnedPollCursor("short"));
});

test("invalid, other-owner and changed-query cursors fail before any repository read", async () => {
  let reads = 0;
  const service = new PollService({ listOwnedSummaries: async () => { reads += 1; return { items: [] }; } },
    { baseUrl: "https://example.test", tokenHashKey: "unused", dashboardCursorSecret: secret });
  const cursor = new OwnedPollCursor(secret).sign("owner", query, key);
  for (const [input, owner] of [[{ cursor }, "other"], [{ cursor, filter: "closed" }, "owner"], [{ cursor, pageSize: 1 }, "owner"],
    [{ cursor, search: "Dinner" }, "owner"], [{ cursor: "invalid" }, "owner"], [{ ownerId: "owner" }, "owner"]]) {
    await assert.rejects(service.listOwned(input, owner), { code: "VALIDATION_ERROR" });
  }
  assert.equal(reads, 0);
});
