import { describe, expect, it } from "vitest";
import { scanIcalPhysicalLines } from "../../../src/channels/providers/ical/parse/scanIcalPhysicalLines";
import { unfoldIcalLogicalLines } from "../../../src/channels/providers/ical/parse/unfoldIcalLines";
import { ICAL_PARSE_LIMITS } from "../../../src/channels/providers/ical/parse/icalParseLimits";

function enc(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

function unfold(s: string) {
  const bytes = enc(s);
  return unfoldIcalLogicalLines(bytes, scanIcalPhysicalLines(bytes));
}

describe("unfoldIcalLogicalLines", () => {
  it("unfolds SP and HTAB continuations", () => {
    // Fold removes exactly one leading SP/HTAB.
    expect(unfold("ABC\r\n DEF").map((l) => l.text)).toEqual(["ABCDEF"]);
    expect(unfold("ABC\n\tDEF").map((l) => l.text)).toEqual(["ABCDEF"]);
  });

  it("preserves additional leading whitespace after fold marker", () => {
    expect(unfold("ABC\n  DEF").map((l) => l.text)).toEqual(["ABC DEF"]);
  });

  it("rejects orphan continuation", () => {
    expect(() => unfold(" DEF")).toThrow(
      expect.objectContaining({ code: "ICAL_PARSE_MALFORMED_FOLDING" }),
    );
  });

  it("rejects empty logical line", () => {
    expect(() => unfold("A\n\nB")).toThrow(
      expect.objectContaining({ code: "ICAL_PARSE_MALFORMED_FOLDING" }),
    );
  });

  it("allows missing final newline", () => {
    expect(unfold("ONLY").map((l) => l.text)).toEqual(["ONLY"]);
  });

  it("strips leading BOM and rejects internal BOM", () => {
    const withBom = new Uint8Array([0xef, 0xbb, 0xbf, ...enc("BEGIN:VCALENDAR")]);
    expect(unfoldIcalLogicalLines(withBom, scanIcalPhysicalLines(withBom))[0]!.text).toBe(
      "BEGIN:VCALENDAR",
    );
    const internal = enc("A\uFEFFB");
    expect(() => unfoldIcalLogicalLines(internal, scanIcalPhysicalLines(internal))).toThrow(
      expect.objectContaining({ code: "ICAL_PARSE_BAD_BOM" }),
    );
  });

  it("enforces logical length cap", () => {
    const long = "A".repeat(ICAL_PARSE_LIMITS.maxLogicalLineUtf16Length);
    const folded = `${long}\n ${"B"}`;
    expect(() => unfold(folded)).toThrow(
      expect.objectContaining({ limitKey: "maxLogicalLineUtf16Length" }),
    );
  });
});
