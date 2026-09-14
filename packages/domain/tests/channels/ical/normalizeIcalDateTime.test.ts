import { describe, expect, it } from "vitest";
import { normalizeIcalDateTime } from "../../../src/channels/providers/ical/parse/normalizeIcalDateTime";
import type { NormalizedIcalProperty } from "../../../src/channels/providers/ical/parse/icalParseTypes";

function prop(
  name: string,
  value: string,
  parameters: NormalizedIcalProperty["parameters"] = [],
): NormalizedIcalProperty {
  return { name, value, parameters, propertyIndex: 0 };
}

describe("normalizeIcalDateTime", () => {
  it("does not promote bare DATE-shaped DTSTART without VALUE=DATE", () => {
    const result = normalizeIcalDateTime("DTSTART", prop("DTSTART", "20260101"));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issue).toBe("VALUE_TYPE_MISMATCH");
    }
  });

  it("promotes explicit VALUE=DATE", () => {
    const result = normalizeIcalDateTime(
      "DTSTART",
      prop("DTSTART", "20260101", [{ name: "VALUE", values: ["DATE"] }]),
    );
    expect(result).toEqual({
      ok: true,
      value: { kind: "date", year: 2026, month: 1, day: 1, value: "20260101" },
    });
  });

  it("promotes UTC, floating, and TZID forms for DTSTART", () => {
    expect(normalizeIcalDateTime("DTSTART", prop("DTSTART", "20260101T120000Z"))).toMatchObject({
      ok: true,
      value: { kind: "dateTimeUtc" },
    });
    expect(normalizeIcalDateTime("DTSTART", prop("DTSTART", "20260101T120000"))).toMatchObject({
      ok: true,
      value: { kind: "dateTimeFloating" },
    });
    expect(
      normalizeIcalDateTime(
        "DTSTART",
        prop("DTSTART", "20260101T120000", [{ name: "TZID", values: ["Europe/Athens"] }]),
      ),
    ).toMatchObject({
      ok: true,
      value: { kind: "dateTimeWithTzId", tzId: "Europe/Athens" },
    });
  });

  it("rejects TZID with Z, TZID on DATE, empty/duplicate TZID", () => {
    expect(
      normalizeIcalDateTime(
        "DTSTART",
        prop("DTSTART", "20260101T120000Z", [{ name: "TZID", values: ["X"] }]),
      ),
    ).toMatchObject({ ok: false, issue: "TZID_WITH_UTC" });

    expect(
      normalizeIcalDateTime(
        "DTSTART",
        prop("DTSTART", "20260101", [
          { name: "VALUE", values: ["DATE"] },
          { name: "TZID", values: ["X"] },
        ]),
      ),
    ).toMatchObject({ ok: false, issue: "TZID_ON_DATE" });

    expect(
      normalizeIcalDateTime(
        "DTSTART",
        prop("DTSTART", "20260101T120000", [{ name: "TZID", values: [""] }]),
      ),
    ).toMatchObject({ ok: false, issue: "EMPTY_TZID" });

    expect(
      normalizeIcalDateTime(
        "DTSTART",
        prop("DTSTART", "20260101T120000", [
          { name: "TZID", values: ["A"] },
          { name: "TZID", values: ["B"] },
        ]),
      ),
    ).toMatchObject({ ok: false, issue: "DUPLICATE_TZID_PARAMETER" });
  });

  it("validates leap days and rejects fractions, offsets, leap seconds", () => {
    expect(
      normalizeIcalDateTime(
        "DTSTART",
        prop("DTSTART", "20240229", [{ name: "VALUE", values: ["DATE"] }]),
      ),
    ).toMatchObject({ ok: true });
    expect(
      normalizeIcalDateTime(
        "DTSTART",
        prop("DTSTART", "20230229", [{ name: "VALUE", values: ["DATE"] }]),
      ),
    ).toMatchObject({ ok: false });

    expect(
      normalizeIcalDateTime("DTSTART", prop("DTSTART", "20260101T120000.5Z")),
    ).toMatchObject({ ok: false, issue: "UNSUPPORTED_DATETIME_FORM" });
    expect(
      normalizeIcalDateTime("DTSTART", prop("DTSTART", "20260101T120000+0200")),
    ).toMatchObject({ ok: false, issue: "UNSUPPORTED_DATETIME_FORM" });
    expect(
      normalizeIcalDateTime("DTSTART", prop("DTSTART", "20260101T120060Z")),
    ).toMatchObject({ ok: false, issue: "UNSUPPORTED_LEAP_SECOND" });
  });

  it("requires UTC for DTSTAMP, CREATED, LAST-MODIFIED", () => {
    for (const name of ["DTSTAMP", "CREATED", "LAST-MODIFIED"] as const) {
      expect(normalizeIcalDateTime(name, prop(name, "20260101T120000Z"))).toMatchObject({
        ok: true,
        value: { kind: "dateTimeUtc" },
      });
      expect(normalizeIcalDateTime(name, prop(name, "20260101T120000"))).toMatchObject({
        ok: false,
        issue: "DISALLOWED_TEMPORAL_FORM",
      });
      expect(
        normalizeIcalDateTime(
          name,
          prop(name, "20260101", [{ name: "VALUE", values: ["DATE"] }]),
        ),
      ).toMatchObject({ ok: false });
    }
  });

  it("rejects duplicate VALUE", () => {
    expect(
      normalizeIcalDateTime(
        "DTSTART",
        prop("DTSTART", "20260101T120000Z", [
          { name: "VALUE", values: ["DATE-TIME"] },
          { name: "VALUE", values: ["DATE"] },
        ]),
      ),
    ).toMatchObject({ ok: false, issue: "DUPLICATE_VALUE_PARAMETER" });
  });
});
