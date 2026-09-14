import { describe, expect, it } from "vitest";
import {
  buildIcalSnapshotIndex,
  decodeIcalCursor,
  encodeIcalCursor,
  toIcalDigestIndex,
} from "../../../../src/channels";
import { utf8ByteLength } from "../../../../src/channels/utils/sha256Hex";
import { encodeTemporalV1 } from "../../../../src/channels/providers/ical/map/icalIdentityCodec";
import { ICAL_MAP_LIMITS } from "../../../../src/channels/providers/ical/map/icalMapLimits";
import type { NormalizedIcalDateTime } from "../../../../src/channels/providers/ical/parse/icalParseTypes";
import { dateValue, makeCalendar, makeEvent } from "./helpers";

function minimalValidCursorParts(): {
  snapshotHash: string;
  identityKey: string;
  entryHash: string;
} {
  const snapshot = buildIcalSnapshotIndex(
    makeCalendar([makeEvent({ eventIndex: 0, uid: "boundary@example.com" })]),
  );
  const digest = toIcalDigestIndex(snapshot);
  return {
    snapshotHash: digest.snapshotHash,
    identityKey: digest.groups[0]!.identityKey,
    entryHash: digest.groups[0]!.entryContentHashes[0]!,
  };
}

function cursorPrefix(snapshotHash: string): string {
  return `{"v":1,"ss":1,"iv":1,"eh":1,"sh":1,"s":"${snapshotHash}","g":[`;
}

function cursorSuffix(): string {
  return "]}";
}

function oneGroup(identityKey: string, hash: string): string {
  return `{"i":"${identityKey}","h":["${hash}"]}`;
}

function hashForIndex(index: number): string {
  return index.toString(16).padStart(64, "0");
}

describe("IcalCursorDecodeBoundary P1-S4a", () => {
  it("Test A — rejects external payload above 2.5 MiB UTF-8 before parsing", () => {
    const limit = ICAL_MAP_LIMITS.maxCursorPayloadUtf8Bytes;
    const oversize = "x".repeat(limit + 1);
    expect(utf8ByteLength(oversize)).toBeGreaterThan(limit);
    expect(decodeIcalCursor(oversize)).toEqual({
      status: "invalid",
      issueCode: "CURSOR_INVALID",
    });
  });

  it("Test B — hard cap uses UTF-8 bytes, not JS string length", () => {
    const limit = ICAL_MAP_LIMITS.maxCursorPayloadUtf8Bytes;
    const greek = "α";
    const charCount = Math.floor(limit / 2) + 1;
    const payload = greek.repeat(charCount);
    expect(payload.length).toBe(charCount);
    expect(payload.length).toBeLessThan(utf8ByteLength(payload));
    expect(utf8ByteLength(payload)).toBeGreaterThan(limit);
    expect(decodeIcalCursor(payload)).toEqual({
      status: "invalid",
      issueCode: "CURSOR_INVALID",
    });
  });

  it("Test C — rejects at 5_001 groups during parse", () => {
    const { snapshotHash, identityKey, entryHash } = minimalValidCursorParts();
    const groups: string[] = [];
    for (let i = 0; i < 5000; i += 1) {
      const snap = buildIcalSnapshotIndex(
        makeCalendar([makeEvent({ eventIndex: i, uid: `grp-${String(i).padStart(5, "0")}@x.com` })]),
      );
      const digest = toIcalDigestIndex(snap);
      groups.push(
        oneGroup(digest.groups[0]!.identityKey, digest.groups[0]!.entryContentHashes[0]!),
      );
    }
    const overflowGroup = oneGroup(identityKey, entryHash);
    const payload =
      cursorPrefix(snapshotHash) + groups.join(",") + "," + overflowGroup + cursorSuffix();
    expect(decodeIcalCursor(payload)).toEqual({
      status: "invalid",
      issueCode: "CURSOR_INVALID",
    });
  }, 120_000);

  it("Test D — rejects at 5_001 hashes in one group during parse", () => {
    const { snapshotHash, identityKey } = minimalValidCursorParts();
    const hashes = Array.from({ length: 5001 }, (_, i) => `"${hashForIndex(i)}"`).join(",");
    const payload =
      cursorPrefix(snapshotHash) +
      `{"i":"${identityKey}","h":[${hashes}]}` +
      cursorSuffix();
    expect(decodeIcalCursor(payload)).toEqual({
      status: "invalid",
      issueCode: "CURSOR_INVALID",
    });
  });

  it("Test E — rejects at 5_001 total digests across groups during parse", () => {
    const { snapshotHash, identityKey } = minimalValidCursorParts();
    const firstHashes = Array.from({ length: 2500 }, (_, i) => `"${hashForIndex(i)}"`).join(",");
    const secondHashes = Array.from({ length: 2501 }, (_, i) =>
      `"${hashForIndex(i + 2500)}"`,
    ).join(",");
    const snap2 = buildIcalSnapshotIndex(
      makeCalendar([makeEvent({ eventIndex: 1, uid: "second-group@x.com" })]),
    );
    const identityKey2 = toIcalDigestIndex(snap2).groups[0]!.identityKey;
    const payload =
      cursorPrefix(snapshotHash) +
      `{"i":"${identityKey}","h":[${firstHashes}]},` +
      `{"i":"${identityKey2}","h":[${secondHashes}]}` +
      cursorSuffix();
    expect(decodeIcalCursor(payload)).toEqual({
      status: "invalid",
      issueCode: "CURSOR_INVALID",
    });
  });

  it("Test F — rejects identity string longer than 324 characters before decode", () => {
    const { snapshotHash, entryHash } = minimalValidCursorParts();
    const overlongIdentity = "A".repeat(325);
    const payload =
      cursorPrefix(snapshotHash) +
      `{"i":"${overlongIdentity}","h":["${entryHash}"]}` +
      cursorSuffix();
    expect(decodeIcalCursor(payload)).toEqual({
      status: "invalid",
      issueCode: "CURSOR_INVALID",
    });
  });

  it("Test G — rejects bad hash strings during token parse", () => {
    const { snapshotHash, identityKey } = minimalValidCursorParts();
    const validHash = hashForIndex(0);

    const sixtyFive =
      cursorPrefix(snapshotHash) +
      `{"i":"${identityKey}","h":["${validHash}a"]}` +
      cursorSuffix();
    expect(decodeIcalCursor(sixtyFive)).toEqual({
      status: "invalid",
      issueCode: "CURSOR_INVALID",
    });

    const uppercase =
      cursorPrefix(snapshotHash) +
      `{"i":"${identityKey}","h":["${validHash.slice(0, 63)}A"]}` +
      cursorSuffix();
    expect(decodeIcalCursor(uppercase)).toEqual({
      status: "invalid",
      issueCode: "CURSOR_INVALID",
    });

    const veryLong =
      cursorPrefix(snapshotHash) +
      `{"i":"${identityKey}","h":["${"a".repeat(128)}"]}` +
      cursorSuffix();
    expect(decodeIcalCursor(veryLong)).toEqual({
      status: "invalid",
      issueCode: "CURSOR_INVALID",
    });

    const invalidChar =
      cursorPrefix(snapshotHash) +
      `{"i":"${identityKey}","h":["${validHash.slice(0, 32)}g${validHash.slice(33)}"]}` +
      cursorSuffix();
    expect(decodeIcalCursor(invalidChar)).toEqual({
      status: "invalid",
      issueCode: "CURSOR_INVALID",
    });
  });
});

function makeMaxDirectTemporal(): NormalizedIcalDateTime {
  let best: NormalizedIcalDateTime | null = null;
  for (let tzLen = 0; tzLen <= 80; tzLen += 1) {
    const candidate: NormalizedIcalDateTime = {
      kind: "dateTimeWithTzId",
      year: 2026,
      month: 1,
      day: 1,
      hour: 12,
      minute: 0,
      second: 0,
      tzId: "T".repeat(tzLen),
      value: "20260101T120000",
    };
    const bytes = encodeTemporalV1(candidate).byteLength;
    if (bytes <= ICAL_MAP_LIMITS.maxDirectTemporalIdentityBytes) {
      best = candidate;
    }
    if (bytes > ICAL_MAP_LIMITS.maxDirectTemporalIdentityBytes) {
      break;
    }
  }
  if (best === null) {
    throw new Error("fixture failed to produce direct temporal encoding");
  }
  expect(encodeTemporalV1(best).byteLength).toBeLessThanOrEqual(
    ICAL_MAP_LIMITS.maxDirectTemporalIdentityBytes,
  );
  return best;
}

describe("IcalCursorCapacity uid_rid worst-case P1-S4a", () => {
  it("encodes 5000 max uid_rid identities under the hard UTF-8 limit", () => {
    const recurrenceId = makeMaxDirectTemporal();
    const events = Array.from({ length: 5000 }, (_, i) => {
      const prefix = `u${String(i).padStart(4, "0")}`;
      const uid = prefix + "x".repeat(ICAL_MAP_LIMITS.maxDirectUidUtf8Bytes - prefix.length);
      expect(utf8ByteLength(uid)).toBe(ICAL_MAP_LIMITS.maxDirectUidUtf8Bytes);
      return makeEvent({
        eventIndex: i,
        uid,
        recurrenceId,
        dtstart: dateValue("20260101"),
        dtend: dateValue("20260102"),
      });
    });
    const snapshot = buildIcalSnapshotIndex(makeCalendar(events));
    expect(snapshot.entries.every((entry) => entry.identityKind === "uid_rid")).toBe(true);
    const payload = encodeIcalCursor(toIcalDigestIndex(snapshot));
    const byteSize = utf8ByteLength(payload);
    expect(byteSize).toBeLessThanOrEqual(ICAL_MAP_LIMITS.maxCursorPayloadUtf8Bytes);
    expect(byteSize).toBe(2_030_112);
  }, 180_000);
});
