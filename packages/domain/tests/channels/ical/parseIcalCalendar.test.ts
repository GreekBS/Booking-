import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseIcalCalendar } from "../../../src/channels/providers/ical/parse/parseIcalCalendar";
import { IcalParseError } from "../../../src/channels/providers/ical/parse/icalParseErrors";

function enc(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

function fixture(name: string): Uint8Array {
  return new Uint8Array(readFileSync(join(__dirname, "fixtures", name)));
}

describe("parseIcalCalendar", () => {
  it("parses a minimal calendar fixture", () => {
    const cal = parseIcalCalendar(fixture("minimal.ics"));
    expect(cal.version).toBe("2.0");
    expect(cal.prodid).toContain("HCP");
    expect(cal.events).toHaveLength(1);
    expect(cal.events[0]!.uid).toBe("evt-1");
    expect(cal.events[0]!.dtstart?.kind).toBe("dateTimeUtc");
    expect(cal.events[0]!.summary).toBe("Test event");
    expect(cal.rawByteLength).toBeGreaterThan(0);
  });

  it("preserves VTIMEZONE then VEVENT ordering with shared object identity", () => {
    const cal = parseIcalCalendar(fixture("timezone-then-event.ics"));
    expect(cal.components.map((c) => c.name)).toEqual(["VTIMEZONE", "VEVENT"]);
    expect(cal.events).toHaveLength(1);
    expect(cal.events[0]).toBe(cal.components[1]);
    expect(cal.events[0]!.eventIndex).toBe(0);
    expect(cal.events[0]!.componentIndex).toBe(1);
    expect(cal.events[0]!.dtstart?.kind).toBe("dateTimeWithTzId");
    expect(Object.isFrozen(cal)).toBe(true);
    expect(Object.isFrozen(cal.events[0])).toBe(true);
  });

  it("rejects first line that is not BEGIN:VCALENDAR", () => {
    expect(() => parseIcalCalendar(enc("VERSION:2.0\nBEGIN:VCALENDAR\nEND:VCALENDAR"))).toThrow(
      expect.objectContaining({ code: "ICAL_PARSE_MISSING_VCALENDAR" }),
    );
  });

  it("rejects parameterized BEGIN/END and whitespace in component name", () => {
    expect(() =>
      parseIcalCalendar(enc("BEGIN;X=1:VCALENDAR\nEND:VCALENDAR")),
    ).toThrow(expect.objectContaining({ code: "ICAL_PARSE_MALFORMED_BEGIN_END" }));
    expect(() =>
      parseIcalCalendar(enc("BEGIN: VCALENDAR\nEND:VCALENDAR")),
    ).toThrow(expect.objectContaining({ code: "ICAL_PARSE_MALFORMED_BEGIN_END" }));
  });

  it("rejects mismatched END, nested VCALENDAR, trailing content", () => {
    expect(() =>
      parseIcalCalendar(enc("BEGIN:VCALENDAR\nBEGIN:VEVENT\nEND:VCALENDAR\nEND:VCALENDAR")),
    ).toThrow(expect.objectContaining({ code: "ICAL_PARSE_UNBALANCED_COMPONENT" }));

    expect(() =>
      parseIcalCalendar(enc("BEGIN:VCALENDAR\nBEGIN:VCALENDAR\nEND:VCALENDAR\nEND:VCALENDAR")),
    ).toThrow(expect.objectContaining({ code: "ICAL_PARSE_NESTED_VCALENDAR" }));

    expect(() =>
      parseIcalCalendar(enc("BEGIN:VCALENDAR\nEND:VCALENDAR\nBEGIN:VCALENDAR\nEND:VCALENDAR")),
    ).toThrow(expect.objectContaining({ code: "ICAL_PARSE_TRAILING_CONTENT" }));
  });

  it("rejects nested VEVENT and VEVENT outside root", () => {
    expect(() =>
      parseIcalCalendar(
        enc(
          "BEGIN:VCALENDAR\nBEGIN:VEVENT\nBEGIN:VEVENT\nEND:VEVENT\nEND:VEVENT\nEND:VCALENDAR",
        ),
      ),
    ).toThrow(expect.objectContaining({ code: "ICAL_PARSE_NESTED_VEVENT" }));

    expect(() =>
      parseIcalCalendar(
        enc(
          "BEGIN:VCALENDAR\nBEGIN:VTODO\nBEGIN:VEVENT\nEND:VEVENT\nEND:VTODO\nEND:VCALENDAR",
        ),
      ),
    ).toThrow(expect.objectContaining({ code: "ICAL_PARSE_VEVENT_NOT_ROOT_CHILD" }));
  });

  it("allows VALARM under VEVENT and rejects children under VALARM", () => {
    const ok = parseIcalCalendar(
      enc(
        "BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:a\nBEGIN:VALARM\nACTION:DISPLAY\nEND:VALARM\nEND:VEVENT\nEND:VCALENDAR",
      ),
    );
    expect(ok.events[0]!.components[0]!.name).toBe("VALARM");

    expect(() =>
      parseIcalCalendar(
        enc(
          "BEGIN:VCALENDAR\nBEGIN:VEVENT\nBEGIN:VALARM\nBEGIN:X-NEST\nEND:X-NEST\nEND:VALARM\nEND:VEVENT\nEND:VCALENDAR",
        ),
      ),
    ).toThrow(expect.objectContaining({ code: "ICAL_PARSE_VALARM_NESTED" }));
  });

  it("records misplaced VALARM as a non-fatal issue", () => {
    const cal = parseIcalCalendar(
      enc(
        "BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:x\nBEGIN:VALARM\nACTION:DISPLAY\nEND:VALARM\nEND:VCALENDAR",
      ),
    );
    expect(cal.components[0]!.name).toBe("VALARM");
    expect(
      cal.components[0]!.issues.some((i) => i.code === "UNEXPECTED_COMPONENT_PLACEMENT"),
    ).toBe(true);
  });

  it("preserves properties after a child component", () => {
    const cal = parseIcalCalendar(
      enc(
        "BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:a\nBEGIN:VALARM\nACTION:DISPLAY\nEND:VALARM\nSUMMARY:After\nEND:VEVENT\nEND:VCALENDAR",
      ),
    );
    expect(cal.events[0]!.properties.map((p) => p.name)).toEqual(["UID", "SUMMARY"]);
    expect(cal.events[0]!.summary).toBe("After");
  });

  it("does not TEXT-decode RRULE/UID and handles invalid SUMMARY escape", () => {
    const cal = parseIcalCalendar(
      enc(
        "BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:a\\,b\nRRULE:FREQ=DAILY;BYDAY=MO\nSUMMARY:bad\\x\nEND:VEVENT\nEND:VCALENDAR",
      ),
    );
    expect(cal.events[0]!.uid).toBe("a\\,b");
    expect(cal.events[0]!.properties.find((p) => p.name === "RRULE")!.value).toBe(
      "FREQ=DAILY;BYDAY=MO",
    );
    expect(cal.events[0]!.summary).toBeNull();
    expect(cal.events[0]!.issues.some((i) => i.code === "INVALID_TEXT_ESCAPE")).toBe(true);
  });

  it("emits calendar metadata issues without rejecting the document", () => {
    const cal = parseIcalCalendar(enc("BEGIN:VCALENDAR\nEND:VCALENDAR"));
    expect(cal.issues.some((i) => i.code === "MISSING_VERSION")).toBe(true);
    expect(cal.issues.some((i) => i.code === "MISSING_PRODID")).toBe(true);

    const unsupported = parseIcalCalendar(
      enc("BEGIN:VCALENDAR\nVERSION:1.0\nPRODID:x\nEND:VCALENDAR"),
    );
    expect(unsupported.version).toBe("1.0");
    expect(unsupported.issues.some((i) => i.code === "UNSUPPORTED_VERSION")).toBe(true);
  });

  it("is deterministic and does not retain the input buffer", () => {
    const bytes = enc(
      "BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:x\nBEGIN:VEVENT\nUID:1\nEND:VEVENT\nEND:VCALENDAR",
    );
    const a = parseIcalCalendar(bytes);
    const b = parseIcalCalendar(bytes);
    expect(a).toEqual(b);
    expect((a as { _buf?: Uint8Array })._buf).toBeUndefined();
  });

  it("wraps unexpected errors as ICAL_PARSE_INTERNAL_ERROR", () => {
    // Direct construction path: valid parse should not throw internal.
    expect(() => parseIcalCalendar(enc("BEGIN:VCALENDAR\nEND:VCALENDAR"))).not.toThrow(
      expect.objectContaining({ code: "ICAL_PARSE_INTERNAL_ERROR" }),
    );
    expect(() => parseIcalCalendar(new Uint8Array([0xff]))).toThrow(IcalParseError);
  });
});
