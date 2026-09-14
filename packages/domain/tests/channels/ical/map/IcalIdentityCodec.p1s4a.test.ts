import { describe, expect, it } from "vitest";
import {
  buildIcalSnapshotIndex,
  decodeIcalIdentityKey,
} from "../../../../src/channels";
import { encodeUtf8, utf8ByteLength } from "../../../../src/channels/utils/sha256Hex";
import {
  encodeTemporalV1,
  buildEventIdentity,
} from "../../../../src/channels/providers/ical/map/icalIdentityCodec";
import { emptyEqualityFlags } from "../../../../src/channels/providers/ical/map/icalEqualityFlags";
import { ICAL_MAP_LIMITS } from "../../../../src/channels/providers/ical/map/icalMapLimits";
import { dateValue, makeCalendar, makeEvent, utcValue } from "./helpers";

describe("IcalIdentityCodec P1-S4a", () => {
  it("round-trips uid_only and recovers providerEventId", () => {
    const snapshot = buildIcalSnapshotIndex(
      makeCalendar([makeEvent({ eventIndex: 0, uid: "simple-uid" })]),
    );
    const entry = snapshot.entries[0]!;
    expect(entry.identityKind).toBe("uid_only");
    const decoded = decodeIcalIdentityKey(entry.identityKey);
    expect(decoded).toMatchObject({
      kind: "uid_only",
      uid: "simple-uid",
      providerEventId: "simple-uid",
    });
  });

  it("round-trips uid_rid with recoverable RID", () => {
    const rid = dateValue("20260701");
    const snapshot = buildIcalSnapshotIndex(
      makeCalendar([
        makeEvent({
          eventIndex: 0,
          uid: "master@x",
          recurrenceId: rid,
        }),
      ]),
    );
    expect(snapshot.entries[0]!.identityKind).toBe("uid_rid");
    const decoded = decodeIcalIdentityKey(snapshot.entries[0]!.identityKey);
    expect(decoded?.kind).toBe("uid_rid");
    if (decoded?.kind === "uid_rid") {
      expect(decoded.uid).toBe("master@x");
      expect(decoded.recurrenceId).toEqual(rid);
    }
  });

  it("uses anonymous for missing UID and is reorder-stable", () => {
    const a = makeEvent({
      eventIndex: 0,
      uid: null,
      dtstart: dateValue("20260110"),
      dtend: dateValue("20260111"),
    });
    const b = makeEvent({
      eventIndex: 1,
      uid: null,
      dtstart: dateValue("20260210"),
      dtend: dateValue("20260211"),
    });
    const hash1 = buildIcalSnapshotIndex(makeCalendar([a, b])).snapshotHash;
    const hash2 = buildIcalSnapshotIndex(makeCalendar([
      { ...b, eventIndex: 0, componentIndex: 0 },
      { ...a, eventIndex: 1, componentIndex: 1 },
    ])).snapshotHash;
    expect(hash1).toBe(hash2);
  });

  it("preserves multiplicity for identical anonymous twins", () => {
    const twin = (index: number) =>
      makeEvent({
        eventIndex: index,
        uid: null,
        dtstart: dateValue("20260301"),
        dtend: dateValue("20260302"),
        sequence: 0,
        status: "CONFIRMED",
      });
    const snapshot = buildIcalSnapshotIndex(makeCalendar([twin(0), twin(1)]));
    expect(snapshot.groups).toHaveLength(1);
    expect(snapshot.groups[0]!.entryContentHashes).toHaveLength(2);
    expect(snapshot.groups[0]!.entryContentHashes[0]).toBe(
      snapshot.groups[0]!.entryContentHashes[1],
    );
  });

  it("uses anonymous_hashed_uid when UID exceeds 128 UTF-8 bytes", () => {
    const uid = "u".repeat(ICAL_MAP_LIMITS.maxDirectUidUtf8Bytes + 1);
    expect(utf8ByteLength(uid)).toBe(129);
    const snapshot = buildIcalSnapshotIndex(
      makeCalendar([makeEvent({ eventIndex: 0, uid })]),
    );
    expect(snapshot.entries[0]!.identityKind).toBe("anonymous_hashed_uid");
    expect(snapshot.entries[0]!.providerEventId).toBeNull();
    expect(snapshot.entries[0]!.equalityFlags.identityInvalid).toBe(true);
    const decoded = decodeIcalIdentityKey(snapshot.entries[0]!.identityKey);
    expect(decoded?.kind).toBe("anonymous_hashed_uid");
  });

  it("accepts UID of exactly 128 UTF-8 bytes as uid_only", () => {
    const uid = "x".repeat(128);
    const snapshot = buildIcalSnapshotIndex(
      makeCalendar([makeEvent({ eventIndex: 0, uid })]),
    );
    expect(snapshot.entries[0]!.identityKind).toBe("uid_only");
  });

  it("uses uid_rid_hashed when temporal encoding exceeds 96 bytes", () => {
    const tzId = "A".repeat(80);
    const raw = "20260101T120000";
    const rid = {
      kind: "dateTimeWithTzId" as const,
      year: 2026,
      month: 1,
      day: 1,
      hour: 12,
      minute: 0,
      second: 0,
      tzId,
      value: raw,
    };
    expect(encodeTemporalV1(rid).byteLength).toBeGreaterThan(
      ICAL_MAP_LIMITS.maxDirectTemporalIdentityBytes,
    );
    const snapshot = buildIcalSnapshotIndex(
      makeCalendar([
        makeEvent({
          eventIndex: 0,
          uid: "ok-uid",
          recurrenceId: rid,
          dtstart: utcValue("20260101T120000Z"),
          dtend: utcValue("20260101T130000Z"),
        }),
      ]),
    );
    expect(snapshot.entries[0]!.identityKind).toBe("uid_rid_hashed");
    expect(snapshot.entries[0]!.equalityFlags.recurrenceIdentityHashed).toBe(true);
    const decoded = decodeIcalIdentityKey(snapshot.entries[0]!.identityKey);
    expect(decoded).toMatchObject({
      kind: "uid_rid_hashed",
      uid: "ok-uid",
      providerEventId: "ok-uid",
      recurrenceIdentityHashed: true,
    });
  });

  it("rejects trailing bytes on identity decode", () => {
    const snapshot = buildIcalSnapshotIndex(
      makeCalendar([makeEvent({ eventIndex: 0, uid: "trail" })]),
    );
    const key = snapshot.entries[0]!.identityKey;
    expect(decodeIcalIdentityKey(`${key}A`)).toBeNull();
  });

  it("keeps delimiter-like UID content collision-free via TLV", () => {
    const uid = "a|rid=b";
    const built = buildEventIdentity({
      uid,
      recurrenceId: null,
      interval: null,
      flags: {
        hasRrule: false,
        hasRdate: false,
        hasExdate: false,
        hasRecurrenceId: false,
        durationPresent: false,
      },
      equalityFlags: emptyEqualityFlags(),
    });
    const decoded = decodeIcalIdentityKey(built.identityKey);
    expect(decoded).toMatchObject({ kind: "uid_only", uid });
  });

  it("accounts Unicode UID by UTF-8 bytes not JS length", () => {
    // 64 Greek alphas = 128 UTF-8 bytes, JS length 64
    const uid = "α".repeat(64);
    expect(uid.length).toBe(64);
    expect(utf8ByteLength(uid)).toBe(128);
    expect(encodeUtf8(uid).byteLength).toBe(128);
    const snapshot = buildIcalSnapshotIndex(
      makeCalendar([makeEvent({ eventIndex: 0, uid })]),
    );
    expect(snapshot.entries[0]!.identityKind).toBe("uid_only");
    const over = "α".repeat(65);
    expect(utf8ByteLength(over)).toBe(130);
    const overSnap = buildIcalSnapshotIndex(
      makeCalendar([makeEvent({ eventIndex: 0, uid: over })]),
    );
    expect(overSnap.entries[0]!.identityKind).toBe("anonymous_hashed_uid");
  });
});
