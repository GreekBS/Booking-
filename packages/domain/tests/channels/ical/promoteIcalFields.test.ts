import { describe, expect, it } from "vitest";
import { promoteEventFields } from "../../../src/channels/providers/ical/parse/promoteIcalFields";
import type { NormalizedIcalProperty } from "../../../src/channels/providers/ical/parse/icalParseTypes";

function p(name: string, value: string, propertyIndex: number): NormalizedIcalProperty {
  return { name, value, parameters: [], propertyIndex };
}

describe("promoteIcalFields", () => {
  it("promotes singular fields and nulls duplicates without winners", () => {
    const single = promoteEventFields(
      [
        p("UID", "a", 0),
        p("SUMMARY", "Hello\\, world", 1),
        p("DTSTART", "20260101T120000Z", 2),
      ],
      { componentIndex: 0, eventIndex: 0 },
    );
    expect(single.uid).toBe("a");
    expect(single.summary).toBe("Hello, world");
    expect(single.dtstart?.kind).toBe("dateTimeUtc");

    const dup = promoteEventFields(
      [p("UID", "a", 0), p("UID", "b", 1), p("DTSTART", "20260101T120000Z", 2)],
      { componentIndex: 0, eventIndex: 0 },
    );
    expect(dup.uid).toBeNull();
    expect(dup.issues.some((i) => i.code === "DUPLICATE_UID_PROPERTY")).toBe(true);
    expect(dup.dtstart?.value).toBe("20260101T120000Z");
  });

  it("treats equal duplicate values as duplicates", () => {
    const dup = promoteEventFields(
      [p("SUMMARY", "x", 0), p("SUMMARY", "x", 1)],
      { componentIndex: 0, eventIndex: 0 },
    );
    expect(dup.summary).toBeNull();
    expect(dup.issues.filter((i) => i.code === "DUPLICATE_SUMMARY_PROPERTY")).toHaveLength(1);
  });

  it("does not TEXT-decode UID and rejects invalid TEXT escapes", () => {
    const uid = promoteEventFields([p("UID", "a\\,b", 0)], {
      componentIndex: 0,
      eventIndex: 0,
    });
    expect(uid.uid).toBe("a\\,b");

    const bad = promoteEventFields([p("SUMMARY", "a\\x", 0)], {
      componentIndex: 0,
      eventIndex: 0,
    });
    expect(bad.summary).toBeNull();
    expect(bad.issues.some((i) => i.code === "INVALID_TEXT_ESCAPE")).toBe(true);
  });

  it("emits one DUPLICATE_DURATION and MULTIPLE_RRULE issues", () => {
    const result = promoteEventFields(
      [p("DURATION", "PT1H", 0), p("DURATION", "PT2H", 1), p("RRULE", "FREQ=DAILY", 2), p("RRULE", "FREQ=WEEKLY", 3)],
      { componentIndex: 0, eventIndex: 0 },
    );
    expect(result.issues.some((i) => i.code === "DUPLICATE_DURATION_PROPERTY")).toBe(true);
    expect(result.issues.some((i) => i.code === "MULTIPLE_RRULE_PROPERTIES")).toBe(true);
  });
});
