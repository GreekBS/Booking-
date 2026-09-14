import { describe, expect, it } from "vitest";
import {
  decodeIcalTextValue,
  decodeIcalUtf8Strict,
  stripLeadingBomOrReject,
} from "../../../src/channels/providers/ical/parse/decodeIcalText";
import { IcalParseError } from "../../../src/channels/providers/ical/parse/icalParseErrors";

describe("decodeIcalUtf8Strict", () => {
  it("decodes ASCII and multibyte", () => {
    expect(decodeIcalUtf8Strict(new TextEncoder().encode("ok Καλό"))).toBe("ok Καλό");
  });

  it("rejects invalid UTF-8", () => {
    expect(() => decodeIcalUtf8Strict(new Uint8Array([0xff, 0xfe]))).toThrow(IcalParseError);
    expect(() => decodeIcalUtf8Strict(new Uint8Array([0xff, 0xfe]))).toThrow(
      expect.objectContaining({ code: "ICAL_PARSE_INVALID_UTF8" }),
    );
  });

  it("rejects NUL", () => {
    expect(() => decodeIcalUtf8Strict(new Uint8Array([0x41, 0x00, 0x42]))).toThrow(
      expect.objectContaining({ code: "ICAL_PARSE_NUL_REJECTED" }),
    );
  });

  it("rejects overlong encodings", () => {
    expect(() => decodeIcalUtf8Strict(new Uint8Array([0xc0, 0x80]))).toThrow(
      expect.objectContaining({ code: "ICAL_PARSE_INVALID_UTF8" }),
    );
  });
});

describe("stripLeadingBomOrReject", () => {
  it("strips one leading BOM", () => {
    expect(stripLeadingBomOrReject("\uFEFFhello")).toBe("hello");
  });

  it("rejects internal BOM", () => {
    expect(() => stripLeadingBomOrReject("a\uFEFFb")).toThrow(
      expect.objectContaining({ code: "ICAL_PARSE_BAD_BOM" }),
    );
  });
});

describe("decodeIcalTextValue", () => {
  it("decodes allowed escapes", () => {
    expect(decodeIcalTextValue("a\\,b\\;c\\\\d\\nE\\NF")).toBe("a,b;c\\d\nE\nF");
  });

  it("rejects unknown escape and trailing backslash", () => {
    expect(decodeIcalTextValue("a\\x")).toBeNull();
    expect(decodeIcalTextValue("a\\")).toBeNull();
  });
});
