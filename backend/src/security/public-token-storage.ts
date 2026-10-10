import { createCipheriv, createDecipheriv, createSecretKey, randomBytes, type KeyObject } from "node:crypto";
import { isPublicToken } from "./public-token.js";

const KEY_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

/** Internal persisted value. Never include this envelope in a transport or audit DTO. */
export interface EncryptedPublicToken {
  readonly version: 1;
  readonly algorithm: "aes-256-gcm";
  readonly keyId: string;
  readonly iv: string;
  readonly ciphertext: string;
  readonly authTag: string;
}

export interface PublicTokenEncryptionContext {
  readonly pollId: string;
  readonly organiserId: string;
  readonly publicTokenHash: string;
}

/** Application boundary; repositories persist only the opaque envelope. */
export interface PublicTokenCipher {
  encrypt(token: string, context: PublicTokenEncryptionContext): EncryptedPublicToken;
  decrypt(envelope: EncryptedPublicToken, context: PublicTokenEncryptionContext): string;
}

export interface PublicTokenEncryptionConfig {
  readonly activeKeyId: string;
  readonly keys: ReadonlyMap<string, KeyObject>;
}

export class AesGcmPublicTokenCipher implements PublicTokenCipher {
  private readonly keys: ReadonlyMap<string, KeyObject>;
  private readonly activeKeyId: string;

  public constructor(config: PublicTokenEncryptionConfig) {
    if (!config || !KEY_ID_PATTERN.test(config.activeKeyId) || !config.keys?.has(config.activeKeyId) ||
        [...config.keys].some(([id, key]) => !KEY_ID_PATTERN.test(id) || key.type !== "secret" || key.symmetricKeySize !== 32)) {
      throw new Error("Invalid public token encryption configuration");
    }
    this.keys = new Map(config.keys);
    this.activeKeyId = config.activeKeyId;
  }

  public encrypt(token: string, context: PublicTokenEncryptionContext): EncryptedPublicToken {
    try {
      if (!isPublicToken(token)) throw new Error();
      const iv = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", this.keys.get(this.activeKeyId)!, iv, { authTagLength: 16 });
      cipher.setAAD(encodePublicTokenEncryptionContext(context));
      const ciphertext = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
      return {
        version: 1, algorithm: "aes-256-gcm", keyId: this.activeKeyId,
        iv: iv.toString("base64url"), ciphertext: ciphertext.toString("base64url"),
        authTag: cipher.getAuthTag().toString("base64url")
      };
    } catch {
      throw new Error("Public token encryption failed");
    }
  }

  public decrypt(envelope: EncryptedPublicToken, context: PublicTokenEncryptionContext): string {
    try {
      if (!isEncryptedPublicToken(envelope)) throw new Error();
      const key = this.keys.get(envelope.keyId);
      if (!key) throw new Error();
      const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(envelope.iv, "base64url"), { authTagLength: 16 });
      decipher.setAAD(encodePublicTokenEncryptionContext(context));
      decipher.setAuthTag(Buffer.from(envelope.authTag, "base64url"));
      const plaintext = Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext, "base64url")), decipher.final()]);
      const token = plaintext.toString("utf8");
      if (!isPublicToken(token)) throw new Error();
      return token;
    } catch {
      throw new Error("Public token decryption failed");
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isEncodedBytes(value: unknown, bytes: number): value is string {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]+$/.test(value)) return false;
  const decoded = Buffer.from(value, "base64url");
  return decoded.byteLength === bytes && decoded.toString("base64url") === value;
}

/** Shape validation only: decryption must also authenticate the tag and bound context. */
export function isEncryptedPublicToken(value: unknown): value is EncryptedPublicToken {
  return isRecord(value) && Object.keys(value).length === 6 &&
    Object.keys(value).every((key) => ["version", "algorithm", "keyId", "iv", "ciphertext", "authTag"].includes(key)) &&
    value.version === 1 && value.algorithm === "aes-256-gcm" &&
    typeof value.keyId === "string" && KEY_ID_PATTERN.test(value.keyId) &&
    isEncodedBytes(value.iv, 12) && isEncodedBytes(value.ciphertext, 32) &&
    isEncodedBytes(value.authTag, 16);
}

/** Stable UTF-8 AAD binds ciphertext to its owner, poll, and current capability hash. */
export function encodePublicTokenEncryptionContext(context: PublicTokenEncryptionContext): Buffer {
  if (typeof context.pollId !== "string" || !context.pollId.trim() ||
      typeof context.organiserId !== "string" || !context.organiserId.trim() ||
      typeof context.publicTokenHash !== "string" || !/^[a-f0-9]{64}$/.test(context.publicTokenHash)) {
    throw new Error("Invalid public token encryption context");
  }
  return Buffer.from(JSON.stringify([
    "invite-agent/public-token", 1, context.pollId, context.organiserId, context.publicTokenHash
  ]), "utf8");
}

/** No defaults in any environment; diagnostics deliberately omit supplied values. */
export function readPublicTokenEncryptionConfig(
  environment: NodeJS.ProcessEnv,
  tokenHashKey: string
): PublicTokenEncryptionConfig {
  const invalid = () => new Error("Invalid public token encryption configuration");
  const activeKeyId = environment.PUBLIC_TOKEN_ENCRYPTION_ACTIVE_KEY_ID;
  const encodedKeys = environment.PUBLIC_TOKEN_ENCRYPTION_KEYS;
  if (!activeKeyId || !KEY_ID_PATTERN.test(activeKeyId) || !encodedKeys || !tokenHashKey.trim()) {
    throw invalid();
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(encodedKeys);
  } catch {
    throw invalid();
  }
  if (!isRecord(parsed) || !Object.hasOwn(parsed, activeKeyId)) throw invalid();
  const keys = new Map<string, KeyObject>();
  const distinctKeys = new Set<string>();
  for (const [id, value] of Object.entries(parsed)) {
    if (!KEY_ID_PATTERN.test(id) || !isEncodedBytes(value, 32) ||
        value === tokenHashKey || Buffer.from(value, "base64url").equals(Buffer.from(tokenHashKey, "utf8")) ||
        distinctKeys.has(value)) throw invalid();
    distinctKeys.add(value);
    keys.set(id, createSecretKey(Buffer.from(value, "base64url")));
  }
  return { activeKeyId, keys };
}
