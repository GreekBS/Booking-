import { describe, expect, it } from "vitest";
import {
  buildIcalSnapshotIndex,
  decodeIcalCursor,
  mapIcalCalendar,
  mayEmitReservationCreate,
  toIcalDigestIndex,
} from "../../../../src/channels";
import { dateValue, makeCalendar, makeEvent } from "./helpers";

describe("IcalMapCalendar P1-S4b", () => {
  it("invalid previous cursor → additions only with CURSOR_INVALID issue", () => {
    const calendar = makeCalendar([makeEvent({ eventIndex: 0, uid: "new@x" })]);
    const batch = mapIcalCalendar({ calendar, previousCursorPayload: "{bad" });
    expect(batch.mapIssues.some((i) => i.code === "CURSOR_INVALID")).toBe(true);
    expect(batch.records.every((r) => r.change === "added")).toBe(true);
    expect(batch.removedCount).toBe(0);
    expect(decodeIcalCursor(batch.proposedCursorPayload).status).toBe("valid");
  });

  it("unsupported previous cursor → additions only with CURSOR_UNSUPPORTED_VERSION", () => {
    const valid = mapIcalCalendar({
      calendar: makeCalendar([makeEvent({ eventIndex: 0 })]),
      previousCursorPayload: null,
    });
    const unsupported = valid.proposedCursorPayload.replace('"v":1', '"v":2');
    const batch = mapIcalCalendar({
      calendar: makeCalendar([makeEvent({ eventIndex: 0, uid: "x@x" })]),
      previousCursorPayload: unsupported,
    });
    expect(batch.mapIssues.some((i) => i.code === "CURSOR_UNSUPPORTED_VERSION")).toBe(true);
    expect(batch.records.every((r) => r.change === "added")).toBe(true);
    expect(batch.removedCount).toBe(0);
  });

  it("absent previous cursor → all added, no cursor issue", () => {
    const batch = mapIcalCalendar({
      calendar: makeCalendar([makeEvent({ eventIndex: 0, uid: "a@x" })]),
      previousCursorPayload: null,
    });
    expect(batch.mapIssues.some((i) => i.code === "CURSOR_INVALID")).toBe(false);
    expect(batch.mapIssues.some((i) => i.code === "CURSOR_UNSUPPORTED_VERSION")).toBe(false);
    expect(batch.addedCount).toBe(1);
    expect(batch.records).toHaveLength(1);
    expect(batch.records[0]!.change).toBe("added");
  });

  it("proposed cursor round-trips current digest", () => {
    const calendar = makeCalendar([
      makeEvent({ eventIndex: 0, uid: "a@x" }),
      makeEvent({ eventIndex: 1, uid: "b@x" }),
    ]);
    const batch = mapIcalCalendar({ calendar, previousCursorPayload: null });
    const decoded = decodeIcalCursor(batch.proposedCursorPayload);
    expect(decoded.status).toBe("valid");
    if (decoded.status === "valid") {
      const expected = toIcalDigestIndex(buildIcalSnapshotIndex(calendar));
      expect(decoded.index).toEqual(expected);
    }
  });

  it("unchanged second map produces zero records", () => {
    const calendar = makeCalendar([makeEvent({ eventIndex: 0, uid: "stable@x" })]);
    const first = mapIcalCalendar({ calendar, previousCursorPayload: null });
    const second = mapIcalCalendar({
      calendar,
      previousCursorPayload: first.proposedCursorPayload,
    });
    expect(second.records).toHaveLength(0);
    expect(second.unchangedCount).toBe(1);
    expect(second.proposedCursorPayload).toBe(first.proposedCursorPayload);
  });

  it("removal after restart reconstructs removed evidence from cursor only", () => {
    const calendar1 = makeCalendar([makeEvent({ eventIndex: 0, uid: "gone@x" })]);
    const first = mapIcalCalendar({ calendar: calendar1, previousCursorPayload: null });
    const second = mapIcalCalendar({
      calendar: makeCalendar([]),
      previousCursorPayload: first.proposedCursorPayload,
    });
    expect(second.removedCount).toBe(1);
    expect(second.records).toHaveLength(1);
    const removed = second.records[0]!;
    expect(removed.change).toBe("removed");
    if (removed.change === "removed") {
      expect(removed.primaryCategory).toBe("cancellation_unproven");
      expect(removed.providerEventId).toBe("gone@x");
      expect("interval" in removed).toBe(false);
    }
  });

  it("updated group emits one record per current entry", () => {
    const calendar1 = makeCalendar([makeEvent({ eventIndex: 0, uid: "u@x", sequence: 0 })]);
    const first = mapIcalCalendar({ calendar: calendar1, previousCursorPayload: null });
    const calendar2 = makeCalendar([makeEvent({ eventIndex: 0, uid: "u@x", sequence: 1 })]);
    const second = mapIcalCalendar({
      calendar: calendar2,
      previousCursorPayload: first.proposedCursorPayload,
    });
    expect(second.updatedCount).toBe(1);
    expect(second.records).toHaveLength(1);
    expect(second.records[0]!.change).toBe("updated");
  });

  it("removal multiplicity after restart emits one removed record per prior digest slot (cursor only)", () => {
    const calendarWithDuplicateGroup = makeCalendar([
      makeEvent({ eventIndex: 0, uid: "dup@x", sequence: 0 }),
      makeEvent({ eventIndex: 1, uid: "dup@x", sequence: 1 }),
    ]);
    const first = mapIcalCalendar({ calendar: calendarWithDuplicateGroup, previousCursorPayload: null });
    const previousCursorPayload = first.proposedCursorPayload;
    const decoded = decodeIcalCursor(previousCursorPayload);
    expect(decoded.status).toBe("valid");
    if (decoded.status !== "valid") {
      return;
    }
    expect(decoded.index.groups).toHaveLength(1);
    const priorDigestSlots = decoded.index.groups[0]!.entryContentHashes;
    expect(priorDigestSlots).toHaveLength(2);
    expect(new Set(priorDigestSlots).size).toBe(2);

    const second = mapIcalCalendar({
      calendar: makeCalendar([]),
      previousCursorPayload,
    });

    expect(second.removedCount).toBe(1);
    expect(second.diff.changes).toHaveLength(1);
    expect(second.diff.changes[0]!.change).toBe("removed");
    expect(second.records).toHaveLength(2);
    expect(second.records.every((r) => r.change === "removed")).toBe(true);
    expect(second.records.every((r) => r.primaryCategory === "cancellation_unproven")).toBe(true);
    expect(second.records.every((r) => r.evidenceKind === "unknown")).toBe(true);
    expect(second.records.every((r) => !("interval" in r))).toBe(true);
    expect(second.records.every((r) => !("entryContentHash" in r))).toBe(true);

    const removedHashes = second.records.map((r) =>
      r.change === "removed" ? r.previousEntryContentHash : null,
    );
    expect(removedHashes.sort()).toEqual([...priorDigestSlots].sort());
  });

  it("same UID with different RECURRENCE-ID keeps distinct identityKey (providerEventId is informational)", () => {
  // Contract: providerEventId = informational/non-unique provider metadata.
  // Contract: identityKey = authoritative stable unique provider identity.
    const sharedUid = "master@x";
    const calendar = makeCalendar([
      makeEvent({
        eventIndex: 0,
        uid: sharedUid,
        recurrenceId: dateValue("20260701"),
      }),
      makeEvent({
        eventIndex: 1,
        uid: sharedUid,
        recurrenceId: dateValue("20260702"),
      }),
    ]);
    const batch = mapIcalCalendar({ calendar, previousCursorPayload: null });

    expect(batch.addedCount).toBe(2);
    expect(batch.records).toHaveLength(2);
    const identityKeys = batch.records.map((r) => r.identityKey);
    expect(new Set(identityKeys).size).toBe(2);
    expect(batch.records.every((r) => r.providerEventId === sharedUid)).toBe(true);
    expect(batch.records.every((r) => r.change === "added")).toBe(true);
  });

  it("duplicate group batch counts are group-level while records are entry-level", () => {
    const twin = makeEvent({
      eventIndex: 0,
      uid: "dup@x",
      dtstart: dateValue("20260101"),
      dtend: dateValue("20260102"),
    });
    const batch = mapIcalCalendar({
      calendar: makeCalendar([twin, { ...twin, eventIndex: 1, componentIndex: 1 }]),
      previousCursorPayload: null,
    });
    expect(batch.addedCount).toBe(1);
    expect(batch.records).toHaveLength(2);
  });

  it("does not imply reservation emission authorization", () => {
    const batch = mapIcalCalendar({
      calendar: makeCalendar([
        makeEvent({
          eventIndex: 0,
          uid: "clean@x",
          dtstart: dateValue("20260101"),
          dtend: dateValue("20260105"),
        }),
      ]),
      previousCursorPayload: null,
    });
    expect(batch.records.some((r) => r.evidenceKind === "reservation_candidate")).toBe(false);
    expect(
      mayEmitReservationCreate({ semanticMode: "reservation_feed", semanticConfigVersion: 1 }),
    ).toBe(false);
  });
});
