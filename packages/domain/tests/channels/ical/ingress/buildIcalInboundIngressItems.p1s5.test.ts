import { describe, expect, it } from "vitest";
import { mapIcalCalendar } from "../../../../src/channels";
import { buildIcalInboundIngressItems } from "../../../../src/channels/providers/ical/ingress/buildIcalInboundIngressItems";
import {
  ICAL_INGRESS_DEDUP_KEY_LENGTH,
  ICAL_MESSAGE_ID_LENGTH,
} from "../../../../src/channels/providers/ical/ingress/icalIngressIdentityCodec";
import { dateValue, makeCalendar, makeEvent } from "../map/helpers";

const CONNECTION_ID = "550e8400-e29b-41d4-a716-446655440301";

describe("buildIcalInboundIngressItems P1-S5", () => {
  it("emits reservation.unknown only for added records", () => {
    const batch = mapIcalCalendar({
      calendar: makeCalendar([makeEvent({ eventIndex: 0, uid: "new@x" })]),
      previousCursorPayload: null,
    });
    const items = buildIcalInboundIngressItems(batch.records, CONNECTION_ID);
    expect(items).toHaveLength(1);
    expect(items[0]!.message.kind).toBe("reservation.unknown");
    expect(items[0]!.deduplicationKey.value.length).toBe(ICAL_INGRESS_DEDUP_KEY_LENGTH);
    expect(items[0]!.message.messageId.length).toBe(ICAL_MESSAGE_ID_LENGTH);
  });

  it("uses previousEntryContentHash fingerprint for removed records", () => {
    const first = mapIcalCalendar({
      calendar: makeCalendar([makeEvent({ eventIndex: 0, uid: "gone@x" })]),
      previousCursorPayload: null,
    });
    const second = mapIcalCalendar({
      calendar: makeCalendar([]),
      previousCursorPayload: first.proposedCursorPayload,
    });
    const items = buildIcalInboundIngressItems(second.records, CONNECTION_ID);
    expect(items).toHaveLength(1);
    expect(items[0]!.message.kind).toBe("reservation.unknown");
    const removed = second.records[0]!;
    expect(removed.change).toBe("removed");
    if (removed.change === "removed") {
      expect(items[0]!.message.payload.icalPreviousEntryContentHash).toBe(
        removed.previousEntryContentHash,
      );
    }
  });

  it("preserves identical added twins as distinct dedup keys (×2)", () => {
    const twin = makeEvent({
      eventIndex: 0,
      uid: null,
      dtstart: dateValue("20260301"),
      dtend: dateValue("20260302"),
      sequence: 0,
    });
    const batch = mapIcalCalendar({
      calendar: makeCalendar([twin, { ...twin, eventIndex: 1, componentIndex: 1 }]),
      previousCursorPayload: null,
    });
    const items = buildIcalInboundIngressItems(batch.records, CONNECTION_ID);
    expect(items).toHaveLength(2);
    const dedupKeys = items.map((item) => item.deduplicationKey.value);
    const messageIds = items.map((item) => item.message.messageId);
    expect(new Set(dedupKeys).size).toBe(2);
    expect(new Set(messageIds).size).toBe(2);
    expect(dedupKeys.every((key) => key.length === 80)).toBe(true);
    expect(messageIds.every((id) => id.length === 76)).toBe(true);
  });

  it("preserves three identical added twins with ordinals 0,1,2", () => {
    const twin = (index: number) =>
      makeEvent({
        eventIndex: index,
        componentIndex: index,
        uid: null,
        dtstart: dateValue("20260301"),
        dtend: dateValue("20260302"),
        sequence: 0,
      });
    const batch = mapIcalCalendar({
      calendar: makeCalendar([twin(0), twin(1), twin(2)]),
      previousCursorPayload: null,
    });
    const items = buildIcalInboundIngressItems(batch.records, CONNECTION_ID);
    expect(items).toHaveLength(3);
    expect(new Set(items.map((item) => item.deduplicationKey.value)).size).toBe(3);
  });

  it("preserves identical removed twins as distinct dedup keys", () => {
    const calendarWithDuplicateGroup = makeCalendar([
      makeEvent({ eventIndex: 0, uid: "dup@x", sequence: 0 }),
      makeEvent({ eventIndex: 1, uid: "dup@x", sequence: 1 }),
    ]);
    const first = mapIcalCalendar({ calendar: calendarWithDuplicateGroup, previousCursorPayload: null });
    const second = mapIcalCalendar({
      calendar: makeCalendar([]),
      previousCursorPayload: first.proposedCursorPayload,
    });
    const items = buildIcalInboundIngressItems(second.records, CONNECTION_ID);
    expect(items).toHaveLength(2);
    expect(new Set(items.map((item) => item.deduplicationKey.value)).size).toBe(2);
  });

  it("same UID different RID yields distinct dedup keys", () => {
    const sharedUid = "master@x";
    const batch = mapIcalCalendar({
      calendar: makeCalendar([
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
      ]),
      previousCursorPayload: null,
    });
    const items = buildIcalInboundIngressItems(batch.records, CONNECTION_ID);
    expect(items).toHaveLength(2);
    expect(items.every((item) => item.message.payload.providerEventId === sharedUid)).toBe(true);
    expect(new Set(items.map((item) => item.deduplicationKey.value)).size).toBe(2);
    expect(new Set(batch.records.map((record) => record.identityKey)).size).toBe(2);
  });

  it("reconstructs identical ingress on deterministic retry", () => {
    const batch = mapIcalCalendar({
      calendar: makeCalendar([makeEvent({ eventIndex: 0, uid: "stable@x" })]),
      previousCursorPayload: null,
    });
    const first = buildIcalInboundIngressItems(batch.records, CONNECTION_ID);
    const second = buildIcalInboundIngressItems(batch.records, CONNECTION_ID);
    expect(first.map((item) => item.deduplicationKey.value)).toEqual(
      second.map((item) => item.deduplicationKey.value),
    );
    expect(first.map((item) => item.message.messageId)).toEqual(
      second.map((item) => item.message.messageId),
    );
  });

  it("never emits reservation.create/modify/cancel kinds", () => {
    const batch = mapIcalCalendar({
      calendar: makeCalendar([
        makeEvent({ eventIndex: 0, uid: "a@x" }),
        makeEvent({ eventIndex: 1, uid: "b@x", sequence: 1 }),
      ]),
      previousCursorPayload: null,
    });
    const items = buildIcalInboundIngressItems(batch.records, CONNECTION_ID);
    for (const item of items) {
      expect(item.message.kind).toBe("reservation.unknown");
    }
  });
});
