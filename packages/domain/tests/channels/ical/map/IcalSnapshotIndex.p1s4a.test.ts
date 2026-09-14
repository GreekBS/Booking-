import { describe, expect, it } from "vitest";
import { buildIcalSnapshotIndex, toIcalDigestIndex } from "../../../../src/channels";
import { dateValue, makeCalendar, makeEvent } from "./helpers";

describe("IcalSnapshotIndex P1-S4a", () => {
  it("retains malformed/anonymous events and excludes non-VEVENT by using events[] only", () => {
    const snapshot = buildIcalSnapshotIndex(
      makeCalendar([
        makeEvent({ eventIndex: 0, uid: null, dtend: null }),
        makeEvent({ eventIndex: 1, uid: "ok" }),
      ]),
    );
    expect(snapshot.entries).toHaveLength(2);
    expect(snapshot.entries[0]!.interval).toBeNull();
    expect(snapshot.entries[0]!.equalityFlags.timeInvalid).toBe(true);
    expect(snapshot.entries[0]!.identityKind).toBe("anonymous");
  });

  it("builds digest without text fields or source indexes", () => {
    const snapshot = buildIcalSnapshotIndex(
      makeCalendar([makeEvent({ eventIndex: 0, summary: "secret", uid: "id" })]),
    );
    const digest = toIcalDigestIndex(snapshot);
    expect(JSON.stringify(digest)).not.toContain("secret");
    expect(digest.groups[0]).toEqual({
      identityKey: snapshot.groups[0]!.identityKey,
      entryContentHashes: snapshot.groups[0]!.entryContentHashes,
    });
  });

  it("freezes snapshot output", () => {
    const snapshot = buildIcalSnapshotIndex(makeCalendar([makeEvent({ eventIndex: 0 })]));
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.entries)).toBe(true);
    expect(Object.isFrozen(snapshot.groups)).toBe(true);
  });

  it("marks floating intervals unresolved", () => {
    const snapshot = buildIcalSnapshotIndex(
      makeCalendar([
        makeEvent({
          eventIndex: 0,
          dtstart: {
            kind: "dateTimeFloating",
            year: 2026,
            month: 1,
            day: 1,
            hour: 10,
            minute: 0,
            second: 0,
            value: "20260101T100000",
          },
          dtend: {
            kind: "dateTimeFloating",
            year: 2026,
            month: 1,
            day: 1,
            hour: 11,
            minute: 0,
            second: 0,
            value: "20260101T110000",
          },
        }),
      ]),
    );
    expect(snapshot.entries[0]!.interval).toBeNull();
    expect(snapshot.entries[0]!.equalityFlags.timeInvalid).toBe(true);
  });

  it("resolves DATE+DATE exclusive intervals", () => {
    const snapshot = buildIcalSnapshotIndex(
      makeCalendar([
        makeEvent({
          eventIndex: 0,
          dtstart: dateValue("20260101"),
          dtend: dateValue("20260105"),
        }),
      ]),
    );
    expect(snapshot.entries[0]!.interval?.resolvable).toBe(true);
    expect(snapshot.entries[0]!.interval?.endSource).toBe("dtend");
  });
});
