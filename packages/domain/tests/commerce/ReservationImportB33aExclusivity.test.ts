import { describe, expect, it } from "vitest";
import {
  arePeerConflictsResolved,
  assertKeepCsvExclusivity,
  buildRejectedRowPayload,
  collectConflictBookingIdsFromImportRows,
  findKeepCsvExclusivityViolations,
  findOverlappingKeepCsvPeers,
  importRowsOverlap,
  isImportAvailabilityNonFatalCode,
} from "../../src/commerce/import/ReservationImportExclusivity";
import type { ReservationImportRowRecord } from "../../src/commerce/import/ReservationImportTypes";

function row(
  partial: Partial<ReservationImportRowRecord> &
    Pick<ReservationImportRowRecord, "id" | "checkIn" | "checkOut">,
): ReservationImportRowRecord {
  const now = new Date("2026-10-04T00:00:00.000Z");
  return {
    tenantId: "t1",
    batchId: "b1",
    rowNumber: 1,
    sourceNamespace: "csv_reservation_import",
    externalReference: "EXT",
    unitId: "unit-1",
    temporalClass: "future",
    guestName: "G",
    guestEmail: "g@t.com",
    guestPhone: null,
    guestCount: 2,
    priceSource: "imported_csv",
    importedTotalAmount: "10",
    importedCurrency: "EUR",
    operatorTotalAmount: null,
    operatorCurrency: null,
    conflictResolution: "undecided",
    replaceBookingId: null,
    replaceBookingIds: [],
    conflictSnapshot: {
      version: 1,
      existingBookingIds: [],
      peerImportRowIds: [],
      nonBookingBlockers: [],
      overlaps: [],
    },
    conflictGroupId: null,
    recheckRequired: false,
    status: "pending",
    createdBookingId: null,
    supersededBookingId: null,
    errorCode: null,
    errorMessage: null,
    payload: {},
    processedAt: null,
    createdAt: now,
    updatedAt: now,
    ...partial,
  };
}

describe("B3.3a exclusivity helpers", () => {
  it("treats BLOCKED as non-fatal for import readiness filter", () => {
    expect(isImportAvailabilityNonFatalCode("BLOCKED")).toBe(true);
    expect(isImportAvailabilityNonFatalCode("DATES_BLOCKED")).toBe(true);
    expect(isImportAvailabilityNonFatalCode("TURNOVER_BUFFER")).toBe(true);
    expect(isImportAvailabilityNonFatalCode("MIN_NIGHTS")).toBe(false);
  });

  it("boundary checkout=checkin does not overlap", () => {
    const a = row({ id: "a", checkIn: "2026-10-10", checkOut: "2026-10-12" });
    const b = row({ id: "b", checkIn: "2026-10-12", checkOut: "2026-10-14" });
    expect(importRowsOverlap(a, b)).toBe(false);
  });

  it("pair overlap forbids dual keep_csv", () => {
    const a = row({
      id: "a",
      checkIn: "2026-10-10",
      checkOut: "2026-10-14",
      conflictResolution: "keep_csv",
    });
    const b = row({
      id: "b",
      checkIn: "2026-10-12",
      checkOut: "2026-10-16",
      conflictResolution: "keep_csv",
    });
    expect(findKeepCsvExclusivityViolations([a, b])).toHaveLength(1);
    expect(() => assertKeepCsvExclusivity([a, b])).toThrow(/exclusivity/);
  });

  it("chain allows A+C keep_csv and forbids A+B", () => {
    const a = row({
      id: "a",
      checkIn: "2026-10-10",
      checkOut: "2026-10-12",
      conflictResolution: "keep_csv",
    });
    const b = row({
      id: "b",
      checkIn: "2026-10-11",
      checkOut: "2026-10-13",
      conflictResolution: "keep_existing",
    });
    const c = row({
      id: "c",
      checkIn: "2026-10-12",
      checkOut: "2026-10-14",
      conflictResolution: "keep_csv",
    });
    expect(findKeepCsvExclusivityViolations([a, b, c])).toEqual([]);

    const bKeep = { ...b, conflictResolution: "keep_csv" as const };
    expect(findKeepCsvExclusivityViolations([a, bKeep, c]).length).toBeGreaterThan(0);
  });

  it("findOverlappingKeepCsvPeers uses direct overlap only", () => {
    const a = row({
      id: "a",
      checkIn: "2026-10-10",
      checkOut: "2026-10-12",
      conflictResolution: "keep_csv",
    });
    const b = row({
      id: "b",
      checkIn: "2026-10-11",
      checkOut: "2026-10-13",
      conflictResolution: "keep_csv",
    });
    const c = row({
      id: "c",
      checkIn: "2026-10-12",
      checkOut: "2026-10-14",
      conflictResolution: "keep_csv",
    });
    expect(findOverlappingKeepCsvPeers(a, [a, b, c]).map((r) => r.id)).toEqual(["b"]);
    expect(findOverlappingKeepCsvPeers(c, [a, b, c]).map((r) => r.id)).toEqual(["b"]);
  });

  it("peerConflictsResolved requires exclusivity for keep_csv", () => {
    const a = row({
      id: "a",
      checkIn: "2026-10-10",
      checkOut: "2026-10-14",
      conflictResolution: "keep_csv",
      conflictSnapshot: {
        version: 1,
        existingBookingIds: [],
        peerImportRowIds: ["b"],
        nonBookingBlockers: [],
        overlaps: [],
      },
    });
    const b = row({
      id: "b",
      checkIn: "2026-10-12",
      checkOut: "2026-10-16",
      conflictResolution: "keep_csv",
      conflictSnapshot: {
        version: 1,
        existingBookingIds: [],
        peerImportRowIds: ["a"],
        nonBookingBlockers: [],
        overlaps: [],
      },
    });
    expect(arePeerConflictsResolved(a, [a, b])).toBe(false);
    const bSkip = { ...b, conflictResolution: "keep_existing" as const };
    expect(arePeerConflictsResolved(a, [a, bSkip])).toBe(true);
  });

  it("collectConflictBookingIds dedupes existingBookingIds and overlap peers", () => {
    const b1 = "550e8400-e29b-41d4-a716-446655440101";
    const b2 = "550e8400-e29b-41d4-a716-446655440102";
    const rows = [
      row({
        id: "r1",
        conflictSnapshot: {
          version: 1,
          existingBookingIds: [b1, b2],
          peerImportRowIds: [],
          nonBookingBlockers: [],
          overlaps: [{ otherKind: "existing_booking", otherId: b1, checkIn: "x", checkOut: "y" }],
        },
      }),
      row({
        id: "r2",
        conflictSnapshot: {
          version: 1,
          existingBookingIds: [b2],
          peerImportRowIds: [],
          nonBookingBlockers: [],
          overlaps: [],
        },
      }),
    ];
    expect(collectConflictBookingIdsFromImportRows(rows)).toEqual([b1, b2].sort((a, c) => a.localeCompare(c)));
  });

  it("builds minimized rejected payload without raw CSV", () => {
    const payload = buildRejectedRowPayload({
      externalReference: "X1",
      unitRef: "Sea",
      guestName: "Ada",
      guestEmail: "a@b.co",
      checkIn: "2026-11-01",
      checkOut: "2026-11-02",
      guestCount: 2,
    });
    expect(payload).toEqual({
      externalReference: "X1",
      unitRef: "Sea",
      guestName: "Ada",
      guestEmail: "a@b.co",
      checkIn: "2026-11-01",
      checkOut: "2026-11-02",
      guestCount: 2,
    });
    expect(payload).not.toHaveProperty("raw");
  });
});
