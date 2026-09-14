import { describe, expect, it } from "vitest";
import { decodeUtf8Bytes, encodeUtf8Bytes } from "../../src/shared/kernel/Utf8Bytes";

describe("Utf8Bytes contract hardening", () => {
  it("round-trips ASCII", () => {
    expect(decodeUtf8Bytes(encodeUtf8Bytes("hello"))).toBe("hello");
  });

  it("round-trips Greek", () => {
    expect(decodeUtf8Bytes(encodeUtf8Bytes("Κράτηση"))).toBe("Κράτηση");
  });

  it("round-trips emoji", () => {
    expect(decodeUtf8Bytes(encodeUtf8Bytes("🏨"))).toBe("🏨");
  });

  it("does not throw on malformed UTF-8", () => {
    expect(() => decodeUtf8Bytes(new Uint8Array([0xff, 0xfe]))).not.toThrow();
  });

  it("handles truncated multibyte sequence without throwing", () => {
    expect(() => decodeUtf8Bytes(new Uint8Array([0xe0, 0x80]))).not.toThrow();
  });
});
