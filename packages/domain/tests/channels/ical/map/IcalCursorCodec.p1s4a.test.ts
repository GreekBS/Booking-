import { describe, expect, it } from "vitest";
import {
  buildIcalSnapshotIndex,
  decodeIcalCursor,
  decodeIcalIdentityKey,
  encodeIcalCursor,
  toIcalDigestIndex,
} from "../../../../src/channels";
import { dateValue, makeCalendar, makeEvent } from "./helpers";

describe("IcalCursorCodec P1-S4a", () => {
  it("returns absent for null payload", () => {
    expect(decodeIcalCursor(null)).toEqual({ status: "absent" });
  });

  it("round-trips encode/decode and reconstructs digest after restart", () => {
    const snapshot = buildIcalSnapshotIndex(
      makeCalendar([
        makeEvent({ eventIndex: 0, uid: "a@x" }),
        makeEvent({ eventIndex: 1, uid: "b@x" }),
      ]),
    );
    const digest = toIcalDigestIndex(snapshot);
    const payload = encodeIcalCursor(digest);
    expect(payload).not.toContain('"u"');
    expect(payload.startsWith('{"v":1,"ss":1,"iv":1,"eh":1,"sh":1,"s":')).toBe(true);
    const decoded = decodeIcalCursor(payload);
    expect(decoded.status).toBe("valid");
    if (decoded.status === "valid") {
      expect(decoded.index.snapshotHash).toBe(digest.snapshotHash);
      expect(decoded.index.groups).toEqual(digest.groups);
      expect(decodeIcalIdentityKey(decoded.index.groups[0]!.identityKey)?.providerEventId).toBe(
        "a@x",
      );
    }
  });

  it("rejects invalid JSON softly", () => {
    expect(decodeIcalCursor("{")).toEqual({
      status: "invalid",
      issueCode: "CURSOR_INVALID",
    });
  });

  it("rejects duplicate keys", () => {
    const snapshot = buildIcalSnapshotIndex(makeCalendar([makeEvent({ eventIndex: 0 })]));
    const payload = encodeIcalCursor(toIcalDigestIndex(snapshot));
    const withDup = payload.replace('"v":1', '"v":1,"v":1');
    expect(decodeIcalCursor(withDup).status).toBe("invalid");
  });

  it("rejects unknown keys", () => {
    const snapshot = buildIcalSnapshotIndex(makeCalendar([makeEvent({ eventIndex: 0 })]));
    const payload = encodeIcalCursor(toIcalDigestIndex(snapshot));
    const withUnknown = payload.replace('"g":', '"x":1,"g":');
    expect(decodeIcalCursor(withUnknown).status).toBe("invalid");
  });

  it("reports first unsupported version field in fixed order", () => {
    const snapshot = buildIcalSnapshotIndex(makeCalendar([makeEvent({ eventIndex: 0 })]));
    const payload = encodeIcalCursor(toIcalDigestIndex(snapshot));
    expect(decodeIcalCursor(payload.replace('"v":1', '"v":2'))).toEqual({
      status: "unsupported",
      issueCode: "CURSOR_UNSUPPORTED_VERSION",
      unsupportedField: "v",
    });
    expect(decodeIcalCursor(payload.replace('"ss":1', '"ss":2'))).toEqual({
      status: "unsupported",
      issueCode: "CURSOR_UNSUPPORTED_VERSION",
      unsupportedField: "ss",
    });
    expect(decodeIcalCursor(payload.replace('"iv":1', '"iv":2'))).toEqual({
      status: "unsupported",
      issueCode: "CURSOR_UNSUPPORTED_VERSION",
      unsupportedField: "iv",
    });
    expect(decodeIcalCursor(payload.replace('"eh":1', '"eh":2'))).toEqual({
      status: "unsupported",
      issueCode: "CURSOR_UNSUPPORTED_VERSION",
      unsupportedField: "eh",
    });
    expect(decodeIcalCursor(payload.replace('"sh":1', '"sh":2'))).toEqual({
      status: "unsupported",
      issueCode: "CURSOR_UNSUPPORTED_VERSION",
      unsupportedField: "sh",
    });
  });

  it("rejects invalid hashes and empty h", () => {
    expect(
      decodeIcalCursor(
        '{"v":1,"ss":1,"iv":1,"eh":1,"sh":1,"s":"zz","g":[]}',
      ).status,
    ).toBe("invalid");
  });

  it("rejects unsorted groups", () => {
    const snapshot = buildIcalSnapshotIndex(
      makeCalendar([
        makeEvent({ eventIndex: 0, uid: "a" }),
        makeEvent({ eventIndex: 1, uid: "b" }),
      ]),
    );
    const digest = toIcalDigestIndex(snapshot);
    const g = [...digest.groups].reverse();
    const bad =
      `{"v":1,"ss":1,"iv":1,"eh":1,"sh":1,"s":"${digest.snapshotHash}","g":[` +
      g
        .map(
          (group) =>
            `{"i":"${group.identityKey}","h":[${group.entryContentHashes
              .map((h) => `"${h}"`)
              .join(",")}]}`,
        )
        .join(",") +
      `]}`;
    expect(decodeIcalCursor(bad).status).toBe("invalid");
  });

  it("produces identical snapshotHash after VEVENT reorder including anonymous", () => {
    const e1 = makeEvent({
      eventIndex: 0,
      uid: null,
      dtstart: dateValue("20260501"),
      dtend: dateValue("20260502"),
    });
    const e2 = makeEvent({
      eventIndex: 1,
      uid: "stable@x",
      dtstart: dateValue("20260601"),
      dtend: dateValue("20260602"),
    });
    const h1 = buildIcalSnapshotIndex(makeCalendar([e1, e2])).snapshotHash;
    const h2 = buildIcalSnapshotIndex(
      makeCalendar([
        { ...e2, eventIndex: 0, componentIndex: 0 },
        { ...e1, eventIndex: 1, componentIndex: 1 },
      ]),
    ).snapshotHash;
    expect(h1).toBe(h2);
  });
});
