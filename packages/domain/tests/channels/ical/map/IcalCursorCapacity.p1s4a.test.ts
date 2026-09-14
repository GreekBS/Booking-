import { describe, expect, it } from "vitest";
import {
  buildIcalSnapshotIndex,
  encodeIcalCursor,
  toIcalDigestIndex,
  IcalMapError,
} from "../../../../src/channels";
import { utf8ByteLength } from "../../../../src/channels/utils/sha256Hex";
import { ICAL_MAP_LIMITS } from "../../../../src/channels/providers/ical/map/icalMapLimits";
import { dateValue, makeCalendar, makeEvent } from "./helpers";

describe("IcalCursorCapacity P1-S4a", () => {
  it("encodes 5000 uid_only events under the hard UTF-8 limit", () => {
    const events = Array.from({ length: 5000 }, (_, i) =>
      makeEvent({
        eventIndex: i,
        uid: `uid-${String(i).padStart(4, "0")}@example.com`,
      }),
    );
    const snapshot = buildIcalSnapshotIndex(makeCalendar(events));
    const payload = encodeIcalCursor(toIcalDigestIndex(snapshot));
    expect(utf8ByteLength(payload)).toBeLessThanOrEqual(
      ICAL_MAP_LIMITS.maxCursorPayloadUtf8Bytes,
    );
    expect(snapshot.groups).toHaveLength(5000);
  }, 120_000);

  it("encodes 5000 max-direct-UID identities under the hard UTF-8 limit", () => {
    const events = Array.from({ length: 5000 }, (_, i) => {
      const prefix = `u${String(i).padStart(4, "0")}`;
      const uid = prefix + "x".repeat(ICAL_MAP_LIMITS.maxDirectUidUtf8Bytes - prefix.length);
      return makeEvent({ eventIndex: i, uid });
    });
    const snapshot = buildIcalSnapshotIndex(makeCalendar(events));
    const payload = encodeIcalCursor(toIcalDigestIndex(snapshot));
    expect(utf8ByteLength(payload)).toBeLessThanOrEqual(
      ICAL_MAP_LIMITS.maxCursorPayloadUtf8Bytes,
    );
  }, 120_000);

  it("encodes 5000 anonymous unique-interval events under the hard UTF-8 limit", () => {
    const safeEvents = Array.from({ length: 5000 }, (_, i) => {
      const day = (i % 28) + 1;
      const month = (Math.floor(i / 28) % 12) + 1;
      const year = 2000 + Math.floor(i / (28 * 12));
      const ymd = `${year}${String(month).padStart(2, "0")}${String(day).padStart(2, "0")}`;
      const ymd2 =
        day < 28
          ? `${year}${String(month).padStart(2, "0")}${String(day + 1).padStart(2, "0")}`
          : month < 12
            ? `${year}${String(month + 1).padStart(2, "0")}01`
            : `${year + 1}0101`;
      return makeEvent({
        eventIndex: i,
        uid: null,
        dtstart: dateValue(ymd),
        dtend: dateValue(ymd2),
      });
    });
    const snapshot = buildIcalSnapshotIndex(makeCalendar(safeEvents));
    const payload = encodeIcalCursor(toIcalDigestIndex(snapshot));
    expect(utf8ByteLength(payload)).toBeLessThanOrEqual(
      ICAL_MAP_LIMITS.maxCursorPayloadUtf8Bytes,
    );
  }, 120_000);

  it("encodes one group with 5000 identical hashes under the hard limit", () => {
    const twin = (i: number) =>
      makeEvent({
        eventIndex: i,
        uid: null,
        dtstart: dateValue("20260701"),
        dtend: dateValue("20260702"),
        sequence: 0,
        status: "CONFIRMED",
      });
    const snapshot = buildIcalSnapshotIndex(
      makeCalendar(Array.from({ length: 5000 }, (_, i) => twin(i))),
    );
    expect(snapshot.groups).toHaveLength(1);
    expect(snapshot.groups[0]!.entryContentHashes).toHaveLength(5000);
    const payload = encodeIcalCursor(toIcalDigestIndex(snapshot));
    expect(utf8ByteLength(payload)).toBeLessThanOrEqual(
      ICAL_MAP_LIMITS.maxCursorPayloadUtf8Bytes,
    );
  }, 120_000);

  it("rejects one-over maxEntries", () => {
    const events = Array.from({ length: 5001 }, (_, i) =>
      makeEvent({ eventIndex: i, uid: `u${i}` }),
    );
    expect(() => buildIcalSnapshotIndex(makeCalendar(events))).toThrow(IcalMapError);
  });
});
