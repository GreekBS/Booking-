import { describe, expect, it } from "vitest";
import { PersistenceCorruptionError } from "@hcp/domain";
import {
  parseChannelsCredentialsMasterKey,
  sealUtf8Payload,
  unsealUtf8Payload,
} from "../src/repositories/channels/channelCredentialCrypto";

describe("parseChannelsCredentialsMasterKey (CM-4b S4a-1 corrective)", () => {
  it("accepts a valid base64-encoded 32-byte key", () => {
    const raw = Buffer.alloc(32, 9).toString("base64");
    const key = parseChannelsCredentialsMasterKey(raw);
    expect(key).toHaveLength(32);
    expect(key.equals(Buffer.alloc(32, 9))).toBe(true);
  });

  it("rejects missing value", () => {
    expect(() => parseChannelsCredentialsMasterKey(undefined)).toThrow(
      PersistenceCorruptionError,
    );
    expect(() => parseChannelsCredentialsMasterKey(undefined)).toThrow(
      /not configured/,
    );
  });

  it("rejects empty and whitespace-only values", () => {
    expect(() => parseChannelsCredentialsMasterKey("")).toThrow(PersistenceCorruptionError);
    expect(() => parseChannelsCredentialsMasterKey("   ")).toThrow(PersistenceCorruptionError);
  });

  it("rejects invalid base64", () => {
    expect(() => parseChannelsCredentialsMasterKey("!!!not-base64!!!")).toThrow(
      PersistenceCorruptionError,
    );
    expect(() => parseChannelsCredentialsMasterKey("abc")).toThrow(PersistenceCorruptionError);
  });

  it("rejects decoded keys shorter than 32 bytes", () => {
    const short = Buffer.alloc(16, 1).toString("base64");
    expect(() => parseChannelsCredentialsMasterKey(short)).toThrow(PersistenceCorruptionError);
  });

  it("rejects decoded keys longer than 32 bytes", () => {
    const long = Buffer.alloc(48, 1).toString("base64");
    expect(() => parseChannelsCredentialsMasterKey(long)).toThrow(PersistenceCorruptionError);
  });

  it("error messages never include the raw key material", () => {
    const secretish = Buffer.alloc(16, 42).toString("base64");
    try {
      parseChannelsCredentialsMasterKey(secretish);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(PersistenceCorruptionError);
      expect(String(error)).not.toContain(secretish);
      expect(String(error)).not.toContain(Buffer.alloc(16, 42).toString("hex"));
    }
  });
});

describe("channelCredentialCrypto seal/unseal", () => {
  const key = Buffer.alloc(32, 3);

  it("round-trips plaintext", () => {
    const sealed = sealUtf8Payload(key, JSON.stringify({ apiKey: "secret" }));
    expect(sealed.keyVersion).toBe(1);
    const plain = unsealUtf8Payload(key, sealed.ciphertext);
    expect(JSON.parse(plain)).toEqual({ apiKey: "secret" });
  });

  it("uses a fresh nonce (ciphertexts differ for same plaintext)", () => {
    const a = sealUtf8Payload(key, "same");
    const b = sealUtf8Payload(key, "same");
    expect(a.ciphertext.equals(b.ciphertext)).toBe(false);
  });

  it("fails closed on corrupted ciphertext", () => {
    const sealed = sealUtf8Payload(key, "payload");
    const corrupted = Buffer.from(sealed.ciphertext);
    corrupted[corrupted.length - 1] ^= 0xff;
    expect(() => unsealUtf8Payload(key, corrupted)).toThrow();
  });

  it("fails closed on wrong master key", () => {
    const sealed = sealUtf8Payload(key, "payload");
    const other = Buffer.alloc(32, 4);
    expect(() => unsealUtf8Payload(other, sealed.ciphertext)).toThrow();
  });
});
