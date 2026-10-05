import { randomUUID } from "node:crypto";
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import {
  Booking,
  Hold,
  Quote,
  PricingCalculator,
  CSV_RESERVATION_IMPORT_NAMESPACE,
  RESERVATION_IMPORT_DRAFT_TTL_MS,
  mutationOriginOperator,
} from "@hcp/domain";
import { PrismaHoldRepository } from "../../src/repositories/commerce/HoldRepository";
import { PrismaQuoteRepository } from "../../src/repositories/commerce/QuoteRepository";
import { PrismaBookingRepository } from "../../src/repositories/commerce/BookingRepository";
import { PrismaCalendarBlockRepository } from "../../src/repositories/commerce/CalendarBlockRepository";
import { PrismaRatePlanRepository } from "../../src/repositories/commerce/RatePlanRepository";
import { PrismaCommerceFlowRepository } from "../../src/repositories/commerce/CommerceFlowRepository";
import { PrismaReservationImportRepository } from "../../src/repositories/commerce/ReservationImportRepository";
import { PrismaOutboxRepository } from "../../src/repositories/OutboxRepository";
import { withTenantTransaction } from "../../src/client";
import { truncateIntegrationTables, prisma } from "./helpers";
import { seedCommerceFixture } from "./commerceFixtures";
import { runIntegration } from "./integrationGate";

runIntegration("Reservation import Phase A persistence", () => {
  const outboxRepository = new PrismaOutboxRepository();
  const holdRepository = new PrismaHoldRepository(outboxRepository);
  const quoteRepository = new PrismaQuoteRepository(outboxRepository);
  const bookingRepository = new PrismaBookingRepository(outboxRepository);
  const calendarRepository = new PrismaCalendarBlockRepository();
  const ratePlanRepository = new PrismaRatePlanRepository();
  const commerceFlow = new PrismaCommerceFlowRepository(outboxRepository);
  const imports = new PrismaReservationImportRepository();

  const tenantA = "550e8400-e29b-41d4-a716-4466554400a1";
  const tenantB = "550e8400-e29b-41d4-a716-4466554400b1";
  const propertyA = "550e8400-e29b-41d4-a716-4466554400a2";
  const propertyB = "550e8400-e29b-41d4-a716-4466554400b2";
  const unitA = "550e8400-e29b-41d4-a716-4466554400a3";
  const unitB = "550e8400-e29b-41d4-a716-4466554400b3";
  const actorA = "550e8400-e29b-41d4-a716-4466554400a4";
  const actorB = "550e8400-e29b-41d4-a716-4466554400b4";

  beforeEach(async () => {
    await truncateIntegrationTables();
    await seedCommerceFixture(
      { tenantId: tenantA, propertyId: propertyA, unitId: unitA },
      { adminUserId: actorA },
    );
    await seedCommerceFixture(
      { tenantId: tenantB, propertyId: propertyB, unitId: unitB },
      { adminUserId: actorB },
    );
  });

  afterAll(async () => {
    await truncateIntegrationTables();
    await prisma.$disconnect();
  });

  async function createCompletedBooking(ids: {
    tenantId: string;
    propertyId: string;
    unitId: string;
    bookingId: string;
    checkIn: string;
    checkOut: string;
  }) {
    const hold = Hold.create({
      id: randomUUID(),
      tenantId: ids.tenantId,
      unitId: ids.unitId,
      propertyId: ids.propertyId,
      checkIn: ids.checkIn,
      checkOut: ids.checkOut,
      guestCount: 2,
    });
    await holdRepository.save(hold);
    const ratePlan = (await ratePlanRepository.findByUnitId(ids.unitId, ids.tenantId))!;
    const pricing = new PricingCalculator().calculate(
      ratePlan,
      hold.stayPeriod,
      new Date("2026-01-01T12:00:00.000Z"),
    );
    const quote = Quote.create({
      id: randomUUID(),
      snapshotId: randomUUID(),
      hold,
      pricing,
      propertyTimezone: "Europe/Athens",
    });
    await quoteRepository.save(quote);
    const booking = Booking.create({
      id: ids.bookingId,
      hold,
      quote,
      guest: { name: "Hist Guest", email: "hist@test.com", phone: null },
      confirmationMode: "manual",
    });
    await holdRepository.save(hold);
    await bookingRepository.save(booking);
    booking.confirm(new Date(), mutationOriginOperator());
    await bookingRepository.save(booking);
    booking.complete(new Date());
    await bookingRepository.save(booking);
    return booking;
  }

  it("persists booking supersede metadata and releases exact calendar occupancy", async () => {
    const oldId = "550e8400-e29b-41d4-a716-446655440101";
    const successorId = "550e8400-e29b-41d4-a716-446655440102";
    await createCompletedBooking({
      tenantId: tenantA,
      propertyId: propertyA,
      unitId: unitA,
      bookingId: oldId,
      checkIn: "2024-07-10",
      checkOut: "2024-07-15",
    });

    const successor = await createCompletedBooking({
      tenantId: tenantA,
      propertyId: propertyA,
      unitId: unitA,
      bookingId: successorId,
      checkIn: "2024-08-01",
      checkOut: "2024-08-05",
    });

    const old = (await bookingRepository.findById(oldId, tenantA))!;
    expect(old.status).toBe("completed");
    const activeBefore = await calendarRepository.findActiveBlocks(unitA, tenantA);
    expect(activeBefore.some((b) => b.sourceId === oldId && b.blockType === "booking")).toBe(true);

    await commerceFlow.runInTenantTransaction(tenantA, async () => {
      old.supersedeForImport({
        supersededByBookingId: successor.id,
        reason: "csv_import_replaced",
        at: new Date("2026-10-03T12:00:00.000Z"),
        mutationOrigin: mutationOriginOperator(),
      });
      await bookingRepository.save(old);
      await commerceFlow.releaseBookingCalendarOccupancy(tenantA, oldId);
    });

    const reloaded = (await bookingRepository.findById(oldId, tenantA))!;
    expect(reloaded.status).toBe("completed");
    expect(reloaded.isSuperseded).toBe(true);
    expect(reloaded.supersededByBookingId).toBe(successorId);
    expect(reloaded.supersedeReason).toBe("csv_import_replaced");
    expect(reloaded.guest.name).toBe("Hist Guest");
    expect(reloaded.stayPeriod.checkIn.value).toBe("2024-07-10");

    const activeAfter = await calendarRepository.findActiveBlocks(unitA, tenantA);
    expect(activeAfter.some((b) => b.sourceId === oldId)).toBe(false);
    expect(activeAfter.some((b) => b.sourceId === successorId && b.blockType === "booking")).toBe(
      true,
    );

    // Idempotent release
    await commerceFlow.releaseBookingCalendarOccupancy(tenantA, oldId);
  });

  it("creates draft batch with exactly 72h expiry and lists only resumable drafts", async () => {
    const now = new Date("2026-10-03T10:00:00.000Z");
    const batch = await imports.createBatch({
      id: randomUUID(),
      tenantId: tenantA,
      propertyId: propertyA,
      actorId: actorA,
      filename: "reservations.csv",
      byteSize: 128,
      now,
    });

    expect(batch.expiresAt.getTime() - batch.createdAt.getTime()).toBe(
      RESERVATION_IMPORT_DRAFT_TTL_MS,
    );
    expect(batch.status).toBe("draft");
    expect(batch.sourceNamespace).toBe(CSV_RESERVATION_IMPORT_NAMESPACE);

    const resumable = await imports.listResumableDrafts(tenantA, now);
    expect(resumable.some((b) => b.id === batch.id)).toBe(true);

    const afterExpiry = await imports.listResumableDrafts(
      tenantA,
      new Date(batch.expiresAt.getTime()),
    );
    expect(afterExpiry.some((b) => b.id === batch.id)).toBe(false);

    await expect(
      imports.updateBatch(
        batch.id,
        tenantA,
        { missingPriceStrategy: "talos_for_all_missing" },
        new Date(batch.expiresAt.getTime()),
      ),
    ).rejects.toThrow(/expired/i);

    // Worker independence: rows still present (not physically cleaned) but mutations blocked.
    const rowId = randomUUID();
    await imports.createRows([
      {
        id: rowId,
        tenantId: tenantA,
        batchId: batch.id,
        rowNumber: 1,
        externalReference: "TTL-ROW",
        unitId: unitA,
        checkIn: "2026-12-01",
        checkOut: "2026-12-03",
        temporalClass: "future",
        guestName: "TTL",
        guestEmail: "ttl@test.com",
        guestCount: 1,
      },
    ]);
    await withTenantTransaction(tenantA, async (tx) => {
      await tx.reservationImportBatch.update({
        where: { id: batch.id },
        data: { expiresAt: new Date("2026-10-03T10:00:00.000Z"), status: "draft" },
      });
    });
    const stillDraft = await imports.findBatchById(batch.id, tenantA);
    expect(stillDraft?.status).toBe("draft");
    expect(await imports.listRowsForBatch(batch.id, tenantA)).toHaveLength(1);
    await expect(
      imports.updateRow(
        rowId,
        tenantA,
        { conflictResolution: "keep_csv" },
        new Date("2026-10-06T10:00:00.000Z"),
      ),
    ).rejects.toThrow(/expired/i);
    expect(
      (
        await imports.listResumableDrafts(
          tenantA,
          new Date("2026-10-06T10:00:00.000Z"),
        )
      ).some((b) => b.id === batch.id),
    ).toBe(false);
  });

  it("enforces tenant isolation for batches", async () => {
    const batch = await imports.createBatch({
      id: randomUUID(),
      tenantId: tenantA,
      propertyId: propertyA,
      actorId: actorA,
      filename: "a.csv",
    });
    const foundB = await imports.findBatchById(batch.id, tenantB);
    expect(foundB).toBeNull();
    const draftsB = await imports.listResumableDrafts(tenantB);
    expect(draftsB.some((b) => b.id === batch.id)).toBe(false);

    // Cross-tenant mutation must not touch Tenant A data (RLS + tenant-scoped repo).
    await expect(
      imports.updateBatch(batch.id, tenantB, { rowCount: 99 }),
    ).rejects.toThrow();
    const stillA = await imports.findBatchById(batch.id, tenantA);
    expect(stillA?.rowCount).toBe(0);
  });

  it("persists rows with temporal/pricing/conflict fields and durable idempotency", async () => {
    const batch = await imports.createBatch({
      id: randomUUID(),
      tenantId: tenantA,
      propertyId: propertyA,
      actorId: actorA,
      filename: "rows.csv",
      rowCount: 2,
    });

    const row1Id = randomUUID();
    const row2Id = randomUUID();
    await imports.createRows([
      {
        id: row1Id,
        tenantId: tenantA,
        batchId: batch.id,
        rowNumber: 1,
        externalReference: "EXT-100",
        unitId: unitA,
        checkIn: "2024-07-10",
        checkOut: "2024-07-12",
        temporalClass: "historical",
        guestName: "Γιώργος",
        guestEmail: "g@example.com",
        guestCount: 2,
        priceSource: "imported_csv",
        importedTotalAmount: "850.0000",
        importedCurrency: "EUR",
        conflictSnapshot: { observedBookingId: null },
      },
      {
        id: row2Id,
        tenantId: tenantA,
        batchId: batch.id,
        rowNumber: 2,
        externalReference: "EXT-100",
        unitId: unitA,
        checkIn: "2026-11-10",
        checkOut: "2026-11-15",
        temporalClass: "future",
        guestName: "Other",
        guestEmail: "o@example.com",
        guestCount: 2,
        // Draft duplicate external ref allowed before durable success
      },
    ]);

    const rows = await imports.listRowsForBatch(batch.id, tenantA);
    expect(rows).toHaveLength(2);
    expect(rows[0]!.temporalClass).toBe("historical");
    expect(Number(rows[0]!.importedTotalAmount)).toBe(850);
    expect(rows[0]!.importedCurrency).toBe("EUR");

    await imports.updateRow(row1Id, tenantA, {
      status: "imported",
      createdBookingId: null,
      processedAt: new Date(),
    });

    const durable = await imports.findDurableByExternalReference({
      tenantId: tenantA,
      sourceNamespace: CSV_RESERVATION_IMPORT_NAMESPACE,
      externalReference: "EXT-100",
    });
    expect(durable?.id).toBe(row1Id);

    // Second durable claim for same external ref must fail at DB unique index.
    await expect(
      imports.updateRow(row2Id, tenantA, { status: "imported", processedAt: new Date() }),
    ).rejects.toThrow();
  });

  it("allows only one concurrent durable claim for the same external reference", async () => {
    const batch = await imports.createBatch({
      id: randomUUID(),
      tenantId: tenantA,
      propertyId: propertyA,
      actorId: actorA,
      filename: "concurrent.csv",
    });
    const a = randomUUID();
    const b = randomUUID();
    await imports.createRows([
      {
        id: a,
        tenantId: tenantA,
        batchId: batch.id,
        rowNumber: 1,
        externalReference: "CONCURRENT-REF",
        unitId: unitA,
        checkIn: "2026-12-20",
        checkOut: "2026-12-22",
        temporalClass: "future",
        guestName: "C1",
        guestEmail: "c1@test.com",
        guestCount: 1,
      },
      {
        id: b,
        tenantId: tenantA,
        batchId: batch.id,
        rowNumber: 2,
        externalReference: "CONCURRENT-REF",
        unitId: unitA,
        checkIn: "2026-12-20",
        checkOut: "2026-12-22",
        temporalClass: "future",
        guestName: "C2",
        guestEmail: "c2@test.com",
        guestCount: 1,
      },
    ]);

    const results = await Promise.allSettled([
      imports.updateRow(a, tenantA, { status: "imported", processedAt: new Date() }),
      imports.updateRow(b, tenantA, { status: "imported", processedAt: new Date() }),
    ]);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const durable = await imports.findDurableByExternalReference({
      tenantId: tenantA,
      sourceNamespace: CSV_RESERVATION_IMPORT_NAMESPACE,
      externalReference: "CONCURRENT-REF",
    });
    expect(durable).not.toBeNull();
  });

  it("allows two draft batches to preflight the same external reference", async () => {
    const b1 = await imports.createBatch({
      id: randomUUID(),
      tenantId: tenantA,
      propertyId: propertyA,
      actorId: actorA,
      filename: "one.csv",
    });
    const b2 = await imports.createBatch({
      id: randomUUID(),
      tenantId: tenantA,
      propertyId: propertyA,
      actorId: actorA,
      filename: "two.csv",
    });
    await imports.createRows([
      {
        id: randomUUID(),
        tenantId: tenantA,
        batchId: b1.id,
        rowNumber: 1,
        externalReference: "SHARED-REF",
        unitId: unitA,
        checkIn: "2026-12-01",
        checkOut: "2026-12-05",
        temporalClass: "future",
        guestName: "A",
        guestEmail: "a@test.com",
        guestCount: 1,
      },
    ]);
    await imports.createRows([
      {
        id: randomUUID(),
        tenantId: tenantA,
        batchId: b2.id,
        rowNumber: 1,
        externalReference: "SHARED-REF",
        unitId: unitA,
        checkIn: "2026-12-01",
        checkOut: "2026-12-05",
        temporalClass: "future",
        guestName: "B",
        guestEmail: "b@test.com",
        guestCount: 1,
      },
    ]);
    expect(await imports.listRowsForBatch(b1.id, tenantA)).toHaveLength(1);
    expect(await imports.listRowsForBatch(b2.id, tenantA)).toHaveLength(1);
  });

  it("expires drafts and preserves durable terminal history", async () => {
    const now = new Date("2026-10-03T10:00:00.000Z");
    const draft = await imports.createBatch({
      id: randomUUID(),
      tenantId: tenantA,
      propertyId: propertyA,
      actorId: actorA,
      filename: "expire-me.csv",
      now,
    });
    await imports.createRows([
      {
        id: randomUUID(),
        tenantId: tenantA,
        batchId: draft.id,
        rowNumber: 1,
        externalReference: "TO-DISCARD",
        unitId: unitA,
        checkIn: "2026-12-01",
        checkOut: "2026-12-03",
        temporalClass: "future",
        guestName: "X",
        guestEmail: "x@test.com",
        guestCount: 1,
      },
    ]);

    // Force expiry timestamp in DB
    await withTenantTransaction(tenantA, async (tx) => {
      await tx.reservationImportBatch.update({
        where: { id: draft.id },
        data: { expiresAt: new Date("2026-10-03T09:00:00.000Z") },
      });
    });

    const first = await imports.expireDrafts(new Date("2026-10-03T12:00:00.000Z"), 50);
    expect(first.expiredBatches).toBeGreaterThanOrEqual(1);
    expect(first.discardedRows).toBeGreaterThanOrEqual(1);

    const reloaded = await imports.findBatchById(draft.id, tenantA);
    expect(reloaded?.status).toBe("expired");
    expect(await imports.listRowsForBatch(draft.id, tenantA)).toHaveLength(0);

    const second = await imports.expireDrafts(new Date("2026-10-03T12:00:00.000Z"), 50);
    expect(second.expiredBatches).toBe(0);

    // Cancelled draft semantics
    const live = await imports.createBatch({
      id: randomUUID(),
      tenantId: tenantA,
      propertyId: propertyA,
      actorId: actorA,
      filename: "cancel-me.csv",
    });
    await imports.createRows([
      {
        id: randomUUID(),
        tenantId: tenantA,
        batchId: live.id,
        rowNumber: 1,
        externalReference: "CANCEL-ROW",
        unitId: unitA,
        checkIn: "2026-12-10",
        checkOut: "2026-12-12",
        temporalClass: "future",
        guestName: "Y",
        guestEmail: "y@test.com",
        guestCount: 1,
      },
    ]);
    const cancelled = await imports.cancelDraft(live.id, tenantA);
    expect(cancelled.status).toBe("cancelled");
    expect(await imports.listRowsForBatch(live.id, tenantA)).toHaveLength(0);
  });
});
