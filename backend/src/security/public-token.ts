import { createHmac, randomBytes } from "node:crypto";

const TOKEN_BYTES = 24;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{32}$/;

export function createPublicToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

export function isPublicToken(value: string): boolean {
  if (!TOKEN_PATTERN.test(value)) return false;
  const decoded = Buffer.from(value, "base64url");
  return decoded.byteLength === TOKEN_BYTES && decoded.toString("base64url") === value;
}

export function hashPublicToken(token: string, key: string): string {
  return createHmac("sha256", key).update(token, "utf8").digest("hex");
}

