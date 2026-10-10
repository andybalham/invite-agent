import { randomBytes } from "node:crypto";
import { AesGcmPublicTokenCipher, readPublicTokenEncryptionConfig } from "../../backend/dist/security/index.js";

// Explicit test provisioning: retain this ring for the lifetime of the owned tables/fixture.
export function testPublicTokenEncryptionConfig(hashKey = "local-development-token-hash-key") {
  return readPublicTokenEncryptionConfig({
    PUBLIC_TOKEN_ENCRYPTION_ACTIVE_KEY_ID: "test",
    PUBLIC_TOKEN_ENCRYPTION_KEYS: JSON.stringify({ test: randomBytes(32).toString("base64url") })
  }, hashKey);
}

export function testPublicTokenCipher() {
  return new AesGcmPublicTokenCipher(testPublicTokenEncryptionConfig());
}
