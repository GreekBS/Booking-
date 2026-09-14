import { describe, expect, it } from "vitest";
import {
  buildIcalSnapshotIndex,
  classifyIcalSnapshotEntry,
  classifyIcalSnapshotDiff,
  diffIcalSnapshotIndexes,
  ICAL_MAP_LIMITS,
  toIcalDigestIndex,
} from "../../../../src/channels";
import { utf8ByteLength } from "../../../../src/channels/utils/sha256Hex";
import { encodeTemporalV1 } from "../../../../src/channels/providers/ical/map/icalIdentityCodec";
import { dateValue, issue, makeCalendar, makeEvent, prop, utcValue } from "./helpers";

describe("IcalClassification P1-S4b", () => {
  it("duplicate group with identical twins → duplicate_uid per entry", () => {
    const twin = makeEvent({
      eventIndex: 0,
      uid: "dup@x",
      dtstart: dateValue("20260101"),
      dtend: dateValue("20260102"),
    });
    const current = buildIcalSnapshotIndex(
      makeCalendar([twin, { ...twin, eventIndex: 1, componentIndex: 1 }]),
    );
    const diff = diffIcalSnapshotIndexes(null, current);
    const { records } = classifyIcalSnapshotDiff(diff, current);
    expect(records).toHaveLength(2);
    expect(records.every((r) => r.primaryCategory === "duplicate_uid")).toBe(true);
  });

  it("duplicate group with different hashes → duplicate_uid per entry", () => {
    const current = buildIcalSnapshotIndex(
      makeCalendar([
        makeEvent({ eventIndex: 0, uid: "dup@x", sequence: 0 }),
        makeEvent({ eventIndex: 1, uid: "dup@x", sequence: 1 }),
      ]),
    );
    const diff = diffIcalSnapshotIndexes(null, current);
    const { records } = classifyIcalSnapshotDiff(diff, current);
    expect(records).toHaveLength(2);
    expect(records.every((r) => r.primaryCategory === "duplicate_uid")).toBe(true);
  });

  it("precedence: identity invalid + bad time → malformed_identity", () => {
    const uid = "x".repeat(ICAL_MAP_LIMITS.maxDirectUidUtf8Bytes + 1);
    const entry = buildIcalSnapshotIndex(
      makeCalendar([
        makeEvent({ eventIndex: 0, uid, dtend: null }),
      ]),
    ).entries[0]!;
    const result = classifyIcalSnapshotEntry(entry, false);
    expect(result.primaryCategory).toBe("malformed_identity");
  });

  it("precedence: duplicate group + RRULE → duplicate_uid", () => {
    const current = buildIcalSnapshotIndex(
      makeCalendar([
        makeEvent({
          eventIndex: 0,
          uid: "dup@x",
          properties: [prop("RRULE", "FREQ=DAILY", 0)],
        }),
        makeEvent({
          eventIndex: 1,
          uid: "dup@x",
          properties: [prop("RRULE", "FREQ=DAILY", 0)],
        }),
      ]),
    );
    const entry = current.entries[0]!;
    expect(classifyIcalSnapshotEntry(entry, true).primaryCategory).toBe("duplicate_uid");
  });

  it("precedence: bad time + STATUS:CANCELLED → malformed_time", () => {
    const entry = buildIcalSnapshotIndex(
      makeCalendar([
        makeEvent({ eventIndex: 0, uid: "x@x", dtend: null, status: "CANCELLED" }),
      ]),
    ).entries[0]!;
    expect(classifyIcalSnapshotEntry(entry, false).primaryCategory).toBe("malformed_time");
  });

  it("precedence: STATUS:CANCELLED + RRULE → cancellation_unproven", () => {
    const entry = buildIcalSnapshotIndex(
      makeCalendar([
        makeEvent({
          eventIndex: 0,
          uid: "x@x",
          status: "CANCELLED",
          properties: [prop("RRULE", "FREQ=DAILY", 0)],
        }),
      ]),
    ).entries[0]!;
    expect(classifyIcalSnapshotEntry(entry, false).primaryCategory).toBe("cancellation_unproven");
  });

  it("precedence: RRULE + RECURRENCE-ID → recurring_master", () => {
    const entry = buildIcalSnapshotIndex(
      makeCalendar([
        makeEvent({
          eventIndex: 0,
          uid: "master@x",
          properties: [prop("RRULE", "FREQ=DAILY", 0)],
          recurrenceId: dateValue("20260701"),
        }),
      ]),
    ).entries[0]!;
    expect(classifyIcalSnapshotEntry(entry, false).primaryCategory).toBe("recurring_master");
  });

  it("classifies RRULE master", () => {
    const entry = buildIcalSnapshotIndex(
      makeCalendar([
        makeEvent({
          eventIndex: 0,
          properties: [prop("RRULE", "FREQ=DAILY", 0)],
        }),
      ]),
    ).entries[0]!;
    expect(classifyIcalSnapshotEntry(entry, false).primaryCategory).toBe("recurring_master");
  });

  it("classifies RECURRENCE-ID instance", () => {
    const entry = buildIcalSnapshotIndex(
      makeCalendar([
        makeEvent({
          eventIndex: 0,
          uid: "master@x",
          recurrenceId: dateValue("20260701"),
        }),
      ]),
    ).entries[0]!;
    expect(classifyIcalSnapshotEntry(entry, false).primaryCategory).toBe(
      "recurrence_instance_unsupported",
    );
  });

  it("classifies uid_rid_hashed recurrence identity", () => {
    const tzId = "A".repeat(80);
    const rid = {
      kind: "dateTimeWithTzId" as const,
      year: 2026,
      month: 1,
      day: 1,
      hour: 12,
      minute: 0,
      second: 0,
      tzId,
      value: "20260101T120000",
    };
    expect(encodeTemporalV1(rid).byteLength).toBeGreaterThan(
      ICAL_MAP_LIMITS.maxDirectTemporalIdentityBytes,
    );
    const entry = buildIcalSnapshotIndex(
      makeCalendar([
        makeEvent({
          eventIndex: 0,
          uid: "ok@x",
          recurrenceId: rid,
          dtstart: utcValue("20260101T120000Z"),
          dtend: utcValue("20260101T130000Z"),
        }),
      ]),
    ).entries[0]!;
    expect(entry.identityKind).toBe("uid_rid_hashed");
    expect(classifyIcalSnapshotEntry(entry, false).primaryCategory).toBe(
      "recurrence_instance_unsupported",
    );
  });

  it("classifies clean resolvable interval as availability_block_candidate", () => {
    const entry = buildIcalSnapshotIndex(
      makeCalendar([makeEvent({ eventIndex: 0, uid: "clean@x" })]),
    ).entries[0]!;
    const result = classifyIcalSnapshotEntry(entry, false);
    expect(result.evidenceKind).toBe("availability_block_candidate");
    expect(result.primaryCategory).toBe("inventory_block");
  });

  it("classifies RDATE change as unsupported evidence via content hash only on update", () => {
    const a = buildIcalSnapshotIndex(
      makeCalendar([
        makeEvent({ eventIndex: 0, properties: [prop("RDATE", "20260101", 0)] }),
      ]),
    );
    const b = buildIcalSnapshotIndex(
      makeCalendar([
        makeEvent({ eventIndex: 0, properties: [prop("RDATE", "20260102", 0)] }),
      ]),
    );
    expect(a.entries[0]!.entryContentHash).not.toBe(b.entries[0]!.entryContentHash);
    expect(classifyIcalSnapshotEntry(a.entries[0]!, false).primaryCategory).toBe(
      "unsupported_vevent_feature",
    );
  });

  it("maps MULTIPLE_RRULE parser issue to unsupported_vevent_feature", () => {
    const entry = buildIcalSnapshotIndex(
      makeCalendar([
        makeEvent({
          eventIndex: 0,
          issues: [issue("MULTIPLE_RRULE_PROPERTIES")],
          properties: [prop("RRULE", "FREQ=DAILY", 0), prop("RRULE", "FREQ=WEEKLY", 1)],
        }),
      ]),
    ).entries[0]!;
    expect(classifyIcalSnapshotEntry(entry, false).primaryCategory).toBe("unsupported_vevent_feature");
  });
});
