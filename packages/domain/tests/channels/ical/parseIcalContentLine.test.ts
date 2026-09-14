import { describe, expect, it } from "vitest";
import { parseIcalContentLine } from "../../../src/channels/providers/ical/parse/parseIcalContentLine";

describe("parseIcalContentLine", () => {
  it("parses quoted colon, semicolon, and comma in parameters", () => {
    const parsed = parseIcalContentLine(
      'ATTENDEE;CN="Doe, John";MEMBER="mailto:a@x","mailto:b@x":mailto:j@x',
    );
    expect(parsed.name).toBe("ATTENDEE");
    expect(parsed.parameters).toEqual([
      { name: "CN", values: ["Doe, John"] },
      { name: "MEMBER", values: ["mailto:a@x", "mailto:b@x"] },
    ]);
    expect(parsed.value).toBe("mailto:j@x");
  });

  it("preserves colon inside property value", () => {
    expect(parseIcalContentLine("DESCRIPTION:a:b:c").value).toBe("a:b:c");
  });

  it("allows empty parameter value and duplicate parameter entries", () => {
    const parsed = parseIcalContentLine("X-TEST;A=;A=1;A=2:val");
    expect(parsed.parameters).toEqual([
      { name: "A", values: [""] },
      { name: "A", values: ["1"] },
      { name: "A", values: ["2"] },
    ]);
  });

  it("rejects unmatched quote and DQUOTE in unquoted token", () => {
    expect(() => parseIcalContentLine('X-T;A="abc:val')).toThrow(
      expect.objectContaining({ code: "ICAL_PARSE_MALFORMED_PARAMETER" }),
    );
    expect(() => parseIcalContentLine('X-T;A=ab"c:val')).toThrow(
      expect.objectContaining({ code: "ICAL_PARSE_MALFORMED_PARAMETER" }),
    );
  });

  it("rejects characters after closing quote", () => {
    expect(() => parseIcalContentLine('X-T;A="ab"c:val')).toThrow(
      expect.objectContaining({ code: "ICAL_PARSE_MALFORMED_PARAMETER" }),
    );
  });

  it("rejects group prefixes", () => {
    expect(() => parseIcalContentLine("item1.EMAIL:x")).toThrow(
      expect.objectContaining({ code: "ICAL_PARSE_MALFORMED_PROPERTY" }),
    );
  });

  it("preserves unknown X-property without TEXT unescape", () => {
    const parsed = parseIcalContentLine("X-FOO:a\\,b");
    expect(parsed.name).toBe("X-FOO");
    expect(parsed.value).toBe("a\\,b");
  });

  it("keeps caret sequences literal", () => {
    expect(parseIcalContentLine('X-T;CN="a^n":x').parameters[0]!.values[0]).toBe("a^n");
  });
});
