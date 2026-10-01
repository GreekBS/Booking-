import { describe, expect, it } from "vitest";
import { createHash, randomBytes } from "node:crypto";
import {
  AesHousekeepingQrTokenSealer,
  parseHousekeepingQrEncryptionKey,
} from "../src/repositories/operations/cleaning/housekeepingQrCrypto";
import { PersistenceCorruptionError, ValidationError } from "@hcp/domain";

const KEY = Buffer.alloc(32, 7).toString("base64");

describe("housekeepingQrCrypto", () => {
  it("parses a 32-byte base64 key", () => {
    const key = parseHousekeepingQrEncryptionKey(KEY);
    expect(key).toHaveLength(32);
  });

  it("fails closed when key is missing", () => {
    expect(() => parseHousekeepingQrEncryptionKey(undefined)).toThrow(
      PersistenceCorruptionError,
    );
    expect(() => parseHousekeepingQrEncryptionKey("")).toThrow(
      PersistenceCorruptionError,
    );
  });

  it("fails closed when key is wrong length", () => {
    expect(() =>
      parseHousekeepingQrEncryptionKey(Buffer.alloc(16).toString("base64")),
    ).toThrow(PersistenceCorruptionError);
  });

  it("round-trips seal/unseal without storing plaintext", () => {
    const token = randomBytes(32).toString("hex");
    const hash = createHash("sha256").update(token).digest("hex");
    const sealer = new AesHousekeepingQrTokenSealer(KEY);
    const sealed = sealer.seal(token);

    expect(Buffer.from(sealed.ciphertext).includes(Buffer.from(token, "utf8"))).toBe(
      false,
    );
    expect(sealer.unseal(sealed.ciphertext, sealed.keyVersion)).toBe(token);
    expect(createHash("sha256").update(token).digest("hex")).toBe(hash);
  });

  it("rejects tampered ciphertext", () => {
    const sealer = new AesHousekeepingQrTokenSealer(KEY);
    const sealed = sealer.seal("deadbeef".repeat(8));
    const corrupted = new Uint8Array(sealed.ciphertext);
    corrupted[30] ^= 0xff;
    expect(() => sealer.unseal(corrupted, 1)).toThrow(ValidationError);
  });

  it("AesHousekeepingQrTokenSealer fails closed without env key", () => {
    const sealer = new AesHousekeepingQrTokenSealer(undefined);
    expect(() => sealer.seal("x".repeat(64))).toThrow(PersistenceCorruptionError);
  });
});
