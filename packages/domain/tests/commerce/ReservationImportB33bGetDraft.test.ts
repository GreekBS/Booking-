import { describe, expect, it, vi } from "vitest";
import { Booking, Hold, Quote, type PricingResult } from "../../src/commerce";
import { Money } from "../../src/commerce/shared/value-objects/Money";
import { GetReservationImportDraftUseCase } from "../../src/commerce/import/ReservationImportDraftDecisionUseCases";
import type { IReservationImportRepository } from "../../src/commerce/import/IReservationImportRepository";
import type { ReservationImportBatchRecord, ReservationImportRowRecord } from "../../src/commerce/import/ReservationImportTypes";
import type { IBookingRepository } from "../../src/commerce/ports/CommercePorts";
import type { ActorContext } from "../../src/shared/services/PermissionChecker";

const actor: ActorContext = { userId: "actor-1", role: "admin", propertyIds: null };

function makeBatch(id: string): ReservationImportBatchRecord {
  const now = new Date("2026-10-04T08:00:00.000Z");
  return {
    id,
    tenantId: "tenant-a",
    actorId: "actor-1",
    sourceNamespace: "csv_reservation_import",
    filename: "t.csv",
    byteSize: 10,
    rowCount: 1,
    status: "draft",
    missingPriceStrategy: "undecided",
    expiresAt: new Date("2026-10-07T08:00:00.000Z"),
    committedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

function makeRow(batchId: string, bookingId: string): ReservationImportRowRecord {
  const now = new Date("2026-10-04T08:00:00.000Z");
  return {
    id: "row-1",
    tenantId: "tenant-a",
    batchId,
    rowNumber: 1,
    sourceNamespace: "csv_reservation_import",
    externalReference: "EXT",
    unitId: "unit-1",
    checkIn: "2026-11-10",
    checkOut: "2026-11-12",
    temporalClass: "future",
    guestName: "CSV Guest",
    guestEmail: "g@t.com",
    guestPhone: null,
    guestCount: 2,
    priceSource: "imported_csv",
    importedTotalAmount: "100",
    importedCurrency: "EUR",
    operatorTotalAmount: null,
    operatorCurrency: null,
    conflictResolution: "undecided",
    replaceBookingId: null,
    replaceBookingIds: [],
    conflictSnapshot: {
      version: 1,
      existingBookingIds: [bookingId],
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
  };
}

function makeBooking(id: string, tenantId: string): Booking {
  const hold = Hold.create({
    id: "hold-1",
    tenantId,
    unitId: "unit-1",
    propertyId: "prop-1",
    checkIn: "2026-11-10",
    checkOut: "2026-11-12",
    guestCount: 2,
  });
  const pricing: PricingResult = {
    currency: "EUR",
    subtotal: Money.create("100.0000", "EUR"),
    losDiscountAmount: Money.create("0.0000", "EUR"),
    total: Money.create("100.0000", "EUR"),
    lineItems: [],
    quotedAt: new Date("2026-10-01T12:00:00.000Z"),
  };
  const quote = Quote.create({
    id: "quote-1",
    snapshotId: "snap-1",
    hold,
    pricing,
    propertyTimezone: "Europe/Athens",
  });
  return Booking.create({
    id,
    hold,
    quote,
    guest: { name: "Existing Guest", email: "e@t.com", phone: null },
    confirmationMode: "manual",
  });
}

describe("B3.3b GetReservationImportDraftUseCase conflictBookings", () => {
  it("loads enrichment via single tenant-scoped findByIds", async () => {
    const batch = makeBatch("batch-1");
    const bookingId = "550e8400-e29b-41d4-a716-446655440201";
    const row = makeRow(batch.id, bookingId);

    const imports = {
      findBatchById: vi.fn(async () => batch),
      listRowsForBatch: vi.fn(async () => [row]),
      listRejectedRowsForBatch: vi.fn(async () => []),
    } as unknown as IReservationImportRepository;

    const findByIds = vi.fn(async (ids: string[], tenantId: string) => {
      expect(tenantId).toBe("tenant-a");
      expect(ids).toEqual([bookingId]);
      return [makeBooking(bookingId, tenantId)];
    });

    const bookings = { findByIds } as unknown as IBookingRepository;
    const get = new GetReservationImportDraftUseCase(imports, undefined, bookings);
    const result = await get.execute(batch.id, "tenant-a", actor);
    expect(result.isSuccess).toBe(true);
    const value = result.getValue();
    expect(value.rows).toHaveLength(1);
    expect(value.rejectedRows).toEqual([]);
    expect(value.conflictBookings).toEqual([
      {
        id: bookingId,
        guestName: "Existing Guest",
        checkIn: "2026-11-10",
        checkOut: "2026-11-12",
      },
    ]);
    expect(findByIds).toHaveBeenCalledOnce();
  });

  it("returns empty conflictBookings when booking repository is omitted", async () => {
    const batch = makeBatch("batch-2");
    const bookingId = "550e8400-e29b-41d4-a716-446655440202";
    const imports = {
      findBatchById: vi.fn(async () => batch),
      listRowsForBatch: vi.fn(async () => [makeRow(batch.id, bookingId)]),
      listRejectedRowsForBatch: vi.fn(async () => []),
    } as unknown as IReservationImportRepository;

    const get = new GetReservationImportDraftUseCase(imports);
    const result = await get.execute(batch.id, "tenant-a", actor);
    expect(result.isSuccess).toBe(true);
    expect(result.getValue().conflictBookings).toEqual([]);
  });
});
