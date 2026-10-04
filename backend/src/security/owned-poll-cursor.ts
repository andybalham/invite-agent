import { createHmac, timingSafeEqual } from "node:crypto";
import { ownedPollListRequestSchema, type ResolvedOwnedPollListQuery } from "@invite-a-gent/contracts";
import type { OwnedPollKey } from "../data/dynamodb-poll-repository.js";
import { ApplicationError } from "../application/errors.js";

function invalid(): never {
  throw new ApplicationError("VALIDATION_ERROR", "Invalid poll list cursor");
}

function validKey(value: unknown, owner: string): value is OwnedPollKey {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const key = value as Record<string, { S?: string }>;
  if (Object.keys(key).sort().join(",") !== "GSI1PK,GSI1SK,PK,SK" ||
    Object.values(key).some((part) => !part || typeof part !== "object" || Object.keys(part).join() !== "S" || typeof part.S !== "string")) return false;
  if (key.GSI1PK?.S !== `ORGANISER#${owner}` || key.SK?.S !== "METADATA") return false;
  const match = /^POLL#(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)#([^#\s]+)$/.exec(key.GSI1SK?.S ?? "");
  if (!match?.[1] || !match[2] || key.PK?.S !== `POLL#${match[2]}`) return false;
  const time = new Date(match[1]);
  return Number.isFinite(time.getTime()) && time.toISOString() === match[1];
}

export class OwnedPollCursor {
  public constructor(private readonly secret: string, private readonly now: () => number = Date.now) {
    if (Buffer.byteLength(secret) < 32) throw new Error("Dashboard cursor secret must contain at least 32 bytes");
  }

  public sign(owner: string, query: ResolvedOwnedPollListQuery, key: OwnedPollKey): string {
    if (!validKey(key, owner)) throw new Error("Invalid stored creation-index key");
    const payload = Buffer.from(JSON.stringify({ version: 1, owner, filter: query.filter, search: query.search,
      pageSize: query.pageSize, expiresAt: this.now() + 15 * 60 * 1000, key })).toString("base64url");
    const prefix = `v1.${payload}`;
    const cursor = `${prefix}.${createHmac("sha256", this.secret).update(prefix).digest("base64url")}`;
    if (!ownedPollListRequestSchema.safeParse({ cursor }).success) throw new Error("Cursor exceeds contract bounds");
    return cursor;
  }

  public verify(cursor: string, owner: string, query: ResolvedOwnedPollListQuery): OwnedPollKey {
    if (!ownedPollListRequestSchema.safeParse({ cursor }).success) invalid();
    const [, encoded, signature] = cursor.split(".");
    if (!encoded || !signature) invalid();
    const payload = Buffer.from(encoded, "base64url");
    const mac = Buffer.from(signature, "base64url");
    const expected = createHmac("sha256", this.secret).update(`v1.${encoded}`).digest();
    if (payload.toString("base64url") !== encoded || mac.toString("base64url") !== signature ||
      mac.length !== expected.length || !timingSafeEqual(mac, expected)) invalid();
    let data;
    try { data = JSON.parse(payload.toString("utf8")) as Record<string, unknown>; } catch { invalid(); }
    if (!data || Object.keys(data).sort().join(",") !== "expiresAt,filter,key,owner,pageSize,search,version" ||
      data.version !== 1 || data.owner !== owner || data.filter !== query.filter || data.search !== query.search ||
      data.pageSize !== query.pageSize || typeof data.expiresAt !== "number" || !Number.isSafeInteger(data.expiresAt) ||
      data.expiresAt <= this.now() || data.expiresAt > this.now() + 15 * 60 * 1000 || !validKey(data.key, owner)) invalid();
    return data.key;
  }
}
