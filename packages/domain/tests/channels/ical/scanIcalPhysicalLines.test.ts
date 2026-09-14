import { describe, expect, it } from "vitest";
import { scanIcalPhysicalLines } from "../../../src/channels/providers/ical/parse/scanIcalPhysicalLines";
import { IcalParseError } from "../../../src/channels/providers/ical/parse/icalParseErrors";
import { ICAL_PARSE_LIMITS } from "../../../src/channels/providers/ical/parse/icalParseLimits";

function enc(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

describe("scanIcalPhysicalLines", () => {
  it("rejects empty input", () => {
    expect(() => scanIcalPhysicalLines(new Uint8Array())).toThrow(
      expect.objectContaining({ code: "ICAL_PARSE_EMPTY_INPUT" }),
    );
  });

  it("rejects oversized input", () => {
    const big = new Uint8Array(ICAL_PARSE_LIMITS.maxInputBytes + 1);
    expect(() => scanIcalPhysicalLines(big)).toThrow(
      expect.objectContaining({ code: "ICAL_PARSE_LIMIT_EXCEEDED", limitKey: "maxInputBytes" }),
    );
  });

  it("accepts CRLF, LF, and mixed", () => {
    expect(scanIcalPhysicalLines(enc("a\r\nb\nc")).map((l) => [l.start, l.end])).toEqual([
      [0, 1],
      [3, 4],
      [5, 6],
    ]);
  });

  it("rejects bare CR", () => {
    expect(() => scanIcalPhysicalLines(enc("a\rb"))).toThrow(
      expect.objectContaining({ code: "ICAL_PARSE_BAD_NEWLINE" }),
    );
  });

  it("enforces physical line byte cap", () => {
    const line = "x".repeat(ICAL_PARSE_LIMITS.maxPhysicalLineBytes + 1);
    expect(() => scanIcalPhysicalLines(enc(line))).toThrow(
      expect.objectContaining({ limitKey: "maxPhysicalLineBytes" }),
    );
  });
});
