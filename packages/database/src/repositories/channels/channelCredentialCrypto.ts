import { randomBytes, createCipheriv, createDecipheriv } from "node:crypto";
import { PersistenceCorruptionError, ValidationError } from "@hcp/domain";

const MASTER_KEY_CONFIG_ERROR =
  "Channel credentials encryption is not configured";

/**
 * Parse CHANNELS_CREDENTIALS_MASTER_KEY.
 * Fail closed: missing, empty, non-base64, or decoded length ≠ 32 bytes.
 * Errors never include the raw env value or decoded key material.
 */
export function parseChannelsCredentialsMasterKey(raw: string | undefined): Buffer {
  if (raw == null || typeof raw !== "string" || raw.trim().length === 0) {
    throw new PersistenceCorruptionError(MASTER_KEY_CONFIG_ERROR);
  }

  const trimmed = raw.trim();
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(trimmed) || trimmed.length % 4 !== 0) {
    throw new PersistenceCorruptionError(MASTER_KEY_CONFIG_ERROR);
  }

  const key = Buffer.from(trimmed, "base64");
  if (key.length !== 32) {
    throw new PersistenceCorruptionError(MASTER_KEY_CONFIG_ERROR);
  }

  return key;
}

/** AES-256-GCM seal. IV (12) + tag (16) + ciphertext are concatenated. */
export function sealUtf8Payload(
  masterKey: Buffer,
  plaintext: string,
): {
  ciphertext: Buffer;
  keyVersion: number;
} {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", masterKey, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    ciphertext: Buffer.concat([iv, tag, encrypted]),
    keyVersion: 1,
  };
}

export function unsealUtf8Payload(masterKey: Buffer, ciphertext: Buffer): string {
  if (ciphertext.length < 28) {
    throw new ValidationError("Invalid sealed credential payload");
  }
  const iv = ciphertext.subarray(0, 12);
  const tag = ciphertext.subarray(12, 28);
  const encrypted = ciphertext.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", masterKey, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}
