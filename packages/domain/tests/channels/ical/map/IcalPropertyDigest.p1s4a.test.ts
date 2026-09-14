import { describe, expect, it } from "vitest";
import { buildIcalSnapshotIndex } from "../../../../src/channels";
import { dateValue, issue, makeCalendar, makeEvent, prop } from "./helpers";

describe("IcalPropertyDigest / entry hash P1-S4a", () => {
  function hashOf(event: ReturnType<typeof makeEvent>): string {
    return buildIcalSnapshotIndex(makeCalendar([event])).entries[0]!.entryContentHash;
  }

  it("changes when STATUS changes", () => {
    const a = hashOf(makeEvent({ eventIndex: 0, status: "CONFIRMED" }));
    const b = hashOf(makeEvent({ eventIndex: 0, status: "CANCELLED" }));
    expect(a).not.toBe(b);
  });

  it("changes when SEQUENCE changes", () => {
    const a = hashOf(makeEvent({ eventIndex: 0, sequence: 0 }));
    const b = hashOf(makeEvent({ eventIndex: 0, sequence: 1 }));
    expect(a).not.toBe(b);
  });

  it("changes when DTSTART/DTEND change", () => {
    const a = hashOf(
      makeEvent({
        eventIndex: 0,
        dtstart: dateValue("20260101"),
        dtend: dateValue("20260102"),
      }),
    );
    const b = hashOf(
      makeEvent({
        eventIndex: 0,
        dtstart: dateValue("20260101"),
        dtend: dateValue("20260103"),
      }),
    );
    expect(a).not.toBe(b);
  });

  it("changes when RRULE value changes", () => {
    const a = hashOf(
      makeEvent({
        eventIndex: 0,
        properties: [prop("RRULE", "FREQ=DAILY", 0)],
      }),
    );
    const b = hashOf(
      makeEvent({
        eventIndex: 0,
        properties: [prop("RRULE", "FREQ=WEEKLY", 0)],
      }),
    );
    expect(a).not.toBe(b);
  });

  it("changes when RRULE parameter changes", () => {
    const a = hashOf(
      makeEvent({
        eventIndex: 0,
        properties: [
          prop("RRULE", "FREQ=DAILY", 0, [{ name: "X-A", values: ["1"] }]),
        ],
      }),
    );
    const b = hashOf(
      makeEvent({
        eventIndex: 0,
        properties: [
          prop("RRULE", "FREQ=DAILY", 0, [{ name: "X-A", values: ["2"] }]),
        ],
      }),
    );
    expect(a).not.toBe(b);
  });

  it("changes when RDATE / EXDATE / DURATION values change", () => {
    expect(
      hashOf(makeEvent({ eventIndex: 0, properties: [prop("RDATE", "20260101", 0)] })),
    ).not.toBe(
      hashOf(makeEvent({ eventIndex: 0, properties: [prop("RDATE", "20260102", 0)] })),
    );
    expect(
      hashOf(makeEvent({ eventIndex: 0, properties: [prop("EXDATE", "20260101", 0)] })),
    ).not.toBe(
      hashOf(makeEvent({ eventIndex: 0, properties: [prop("EXDATE", "20260102", 0)] })),
    );
    expect(
      hashOf(makeEvent({ eventIndex: 0, properties: [prop("DURATION", "P1D", 0)] })),
    ).not.toBe(
      hashOf(makeEvent({ eventIndex: 0, properties: [prop("DURATION", "P2D", 0)] })),
    );
  });

  it("treats duplicate recurrence property source order as evidence-sensitive", () => {
    const a = hashOf(
      makeEvent({
        eventIndex: 0,
        properties: [prop("RRULE", "FREQ=DAILY", 0), prop("RRULE", "FREQ=WEEKLY", 1)],
      }),
    );
    const b = hashOf(
      makeEvent({
        eventIndex: 0,
        properties: [prop("RRULE", "FREQ=WEEKLY", 0), prop("RRULE", "FREQ=DAILY", 1)],
      }),
    );
    expect(a).not.toBe(b);
  });

  it("does not change when SUMMARY changes", () => {
    const a = hashOf(makeEvent({ eventIndex: 0, summary: "A" }));
    const b = hashOf(makeEvent({ eventIndex: 0, summary: "B" }));
    expect(a).toBe(b);
  });

  it("does not change for INVALID_TEXT_ESCAPE", () => {
    const a = hashOf(makeEvent({ eventIndex: 0, issues: [] }));
    const b = hashOf(
      makeEvent({
        eventIndex: 0,
        issues: [issue("INVALID_TEXT_ESCAPE", { propertyName: "SUMMARY" })],
      }),
    );
    expect(a).toBe(b);
  });

  it("keeps identity stable when RRULE text changes (update via content hash only)", () => {
    const base = {
      eventIndex: 0,
      uid: null as string | null,
      dtstart: dateValue("20260401"),
      dtend: dateValue("20260402"),
    };
    const snapA = buildIcalSnapshotIndex(
      makeCalendar([
        makeEvent({ ...base, properties: [prop("RRULE", "FREQ=DAILY", 0)] }),
      ]),
    );
    const snapB = buildIcalSnapshotIndex(
      makeCalendar([
        makeEvent({ ...base, properties: [prop("RRULE", "FREQ=WEEKLY", 0)] }),
      ]),
    );
    expect(snapA.entries[0]!.identityKey).toBe(snapB.entries[0]!.identityKey);
    expect(snapA.entries[0]!.entryContentHash).not.toBe(snapB.entries[0]!.entryContentHash);
  });
});
