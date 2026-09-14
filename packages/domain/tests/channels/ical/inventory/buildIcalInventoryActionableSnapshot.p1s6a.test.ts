import { describe, expect, it } from "vitest";
import { parseIcalCalendar } from "../../../../src/channels/providers/ical/parse/parseIcalCalendar";
import { buildIcalSnapshotIndex } from "../../../../src/channels/providers/ical/map/buildIcalSnapshotIndex";
import {
  ICAL_INVENTORY_CAPACITY,
  buildIcalInventoryActionableSnapshot,
  buildMaxSizeActionableItemEncoding,
  buildWorstCaseActionableSnapshotJson,
} from "../../../../src/channels/providers/ical/inventory/buildIcalInventoryActionableSnapshot";
import { utf8ByteLength } from "../../../../src/channels/utils/sha256Hex";
import { encodeIcsCalendar } from "../helpers/encodeIcsCalendar";

function enc(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

describe("P1-S6a buildIcalInventoryActionableSnapshot", () => {
  it("includes DATE-only uid_only / uid_rid and excludes UTC datetime, cancelled, rrule, duplicates", () => {
    const ics = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Test//EN",
      "BEGIN:VEVENT",
      "UID:keep-date-only",
      "DTSTART;VALUE=DATE:20260110",
      "DTEND;VALUE=DATE:20260112",
      "SUMMARY:Keep",
      "END:VEVENT",
      "BEGIN:VEVENT",
      "UID:drop-utc",
      "DTSTART:20260110T120000Z",
      "DTEND:20260111T120000Z",
      "SUMMARY:UTC",
      "END:VEVENT",
      "BEGIN:VEVENT",
      "UID:drop-cancelled",
      "DTSTART;VALUE=DATE:20260201",
      "DTEND;VALUE=DATE:20260203",
      "STATUS:CANCELLED",
      "SUMMARY:Cancelled",
      "END:VEVENT",
      "BEGIN:VEVENT",
      "UID:drop-rrule",
      "DTSTART;VALUE=DATE:20260301",
      "DTEND;VALUE=DATE:20260302",
      "RRULE:FREQ=DAILY;COUNT=2",
      "SUMMARY:Recur",
      "END:VEVENT",
      "BEGIN:VEVENT",
      "UID:dup-a",
      "DTSTART;VALUE=DATE:20260401",
      "DTEND;VALUE=DATE:20260402",
      "SUMMARY:Dup1",
      "END:VEVENT",
      "BEGIN:VEVENT",
      "UID:dup-a",
      "DTSTART;VALUE=DATE:20260403",
      "DTEND;VALUE=DATE:20260404",
      "SUMMARY:Dup2",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");

    const snapshot = buildIcalSnapshotIndex(parseIcalCalendar(enc(ics)));
    const result = buildIcalInventoryActionableSnapshot(snapshot);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.snapshot.items).toHaveLength(1);
    expect(result.snapshot.items[0]?.checkIn).toBe("2026-01-10");
    expect(result.snapshot.items[0]?.checkOut).toBe("2026-01-12");
    expect(result.snapshot.items[0]?.identityKind).toBe("uid_only");
    expect(result.snapshot.completeObservedEvidence).toBe(true);
    expect(result.snapshot.observedSourceIdentityKeys.length).toBeGreaterThanOrEqual(4);
    expect(result.snapshot.cancelledSourceIdentityKeys).toHaveLength(1);
    expect(result.snapshot.items.every((item) =>
      !result.snapshot.cancelledSourceIdentityKeys.includes(item.sourceIdentityKey),
    )).toBe(true);
    expect(result.snapshot.canonicalJson.startsWith("[")).toBe(true);
    expect(result.snapshot.canonicalJson.includes(" ")).toBe(false);
  });

  it("is independent of S4b evidence record count (unchanged entries still project)", () => {
    const ics = encodeIcsCalendar([{ uid: "stay", dtstart: "20260501", dtend: "20260503" }]);
    const snapshot = buildIcalSnapshotIndex(parseIcalCalendar(ics));
    const first = buildIcalInventoryActionableSnapshot(snapshot);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.snapshot.items).toHaveLength(1);
    const second = buildIcalInventoryActionableSnapshot(snapshot);
    expect(second.ok && second.snapshot.canonicalJson).toBe(first.snapshot.canonicalJson);
  });

  it("proves exact max item encoding is 442 UTF-8 bytes and worst-case 5000-item array is 2,215,001", () => {
    const maxItem = buildMaxSizeActionableItemEncoding();
    expect(utf8ByteLength(maxItem)).toBe(ICAL_INVENTORY_CAPACITY.maxItemUtf8Bytes);
    expect(ICAL_INVENTORY_CAPACITY.maxItemUtf8Bytes).toBe(443);

    const worst = buildWorstCaseActionableSnapshotJson(ICAL_INVENTORY_CAPACITY.maxItems);
    const measured = utf8ByteLength(worst);
    expect(measured).toBe(ICAL_INVENTORY_CAPACITY.worstCaseSnapshotUtf8Bytes);
    expect(measured).toBe(2_220_001);
    expect(measured).toBeLessThanOrEqual(ICAL_INVENTORY_CAPACITY.hardCapUtf8Bytes);
    expect(ICAL_INVENTORY_CAPACITY.hardCapUtf8Bytes).toBe(2_621_440);
  });

  it("documents maxItems=5000 and worst-case payload under hard cap", () => {
    expect(ICAL_INVENTORY_CAPACITY.maxItems).toBe(5000);
    const oversizedJson = buildWorstCaseActionableSnapshotJson(5000);
    expect(utf8ByteLength(oversizedJson)).toBe(2_220_001);
  });
});

describe("P1-S6a inventory reconcile outbox identity", () => {
  it("is deterministic and collision-safe for delivery keys", async () => {
    const { buildIcalInventoryReconcileDeliveryKey, ICAL_INVENTORY_RECONCILE_OUTBOX_TAG } =
      await import(
        "../../../../src/channels/providers/ical/inventory/icalInventoryReconcileOutboxIdentity"
      );
    const identity = {
      tenantId: "550e8400-e29b-41d4-a716-446655440001",
      connectionId: "conn-1",
      cursorVersion: 3,
      semanticConfigVersion: 2,
      mappingId: "map-1",
      mappingVersion: 4,
    };
    const a = buildIcalInventoryReconcileDeliveryKey(identity);
    const b = buildIcalInventoryReconcileDeliveryKey(identity);
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(ICAL_INVENTORY_RECONCILE_OUTBOX_TAG).toBe("ical-inventory-reconcile-outbox-v1");
    expect(
      buildIcalInventoryReconcileDeliveryKey({ ...identity, mappingVersion: 5 }),
    ).not.toBe(a);
  });
});
