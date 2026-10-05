import { randomUUID } from "node:crypto";
import { it, expect, beforeEach, afterAll } from "vitest";
import {
  Booking,
  Hold,
  Quote,
  PricingCalculator,
  CreateReservationImportDraftUseCase,
  RecheckReservationImportDraftUseCase,
  ListReservationImportDraftsUseCase,
  GetReservationImportDraftUseCase,
  DiscardReservationImportDraftUseCase,
  UpdateReservationImportMissingPriceStrategyUseCase,
  UpdateReservationImportRowDecisionUseCase,
  ExpireReservationImportDraftsUseCase,
  PermissionChecker,
  RESERVATION_IMPORT_DRAFT_TTL_MS,
  computeReservationImportDraftExpiresAt,
  mutationOriginOperator,
  type ActorContext,
  type ReservationImportRowRecord,
} from "@hcp/domain";
import { PrismaReservationImportRepository } from "../../src/repositories/commerce/ReservationImportRepository";
import { PrismaCsvImportUnitResolver } from "../../src/adapters/PrismaCsvImportUnitResolver";
import { PrismaCatalogQueryAdapter } from "../../src/adapters/CatalogQueryAdapter";
import { PrismaCalendarBlockRepository } from "../../src/repositories/commerce/CalendarBlockRepository";
import { PrismaAvailabilityRulesRepository } from "../../src/repositories/commerce/AvailabilityRulesRepository";
import { PrismaHoldRepository } from "../../src/repositories/commerce/HoldRepository";
import { PrismaQuoteRepository } from "../../src/repositories/commerce/QuoteRepository";
import { PrismaBookingRepository } from "../../src/repositories/commerce/BookingRepository";
import { PrismaRatePlanRepository } from "../../src/repositories/commerce/RatePlanRepository";
import { PrismaOutboxRepository } from "../../src/repositories/OutboxRepository";
import { TimezoneService } from "../../src/adapters/TimezoneService";
import { withTenantTransaction } from "../../src/client";
import { truncateIntegrationTables, prisma } from "./helpers";
import { seedCommerceFixture } from "./commerceFixtures";
import { runIntegration } from "./integrationGate";

runIntegration("Reservation import Phase B2", () => {
  const outboxRepository = new PrismaOutboxRepository();
  const holdRepository = new PrismaHoldRepository(outboxRepository);
  const quoteRepository = new PrismaQuoteRepository(outboxRepository);
  const bookingRepository = new PrismaBookingRepository(outboxRepository);
  const ratePlanRepository = new PrismaRatePlanRepository();
  const imports = new PrismaReservationImportRepository();
  const unitResolver = new PrismaCsvImportUnitResolver();
  const catalog = new PrismaCatalogQueryAdapter();
  const calendarBlocks = new PrismaCalendarBlockRepository();
  const availabilityRules = new PrismaAvailabilityRulesRepository();
  const timezoneService = new TimezoneService();
  const permissionChecker = new PermissionChecker();

  let talosCalls = 0;
  const pricing = {
    async previewTotal() {
      talosCalls += 1;
      return { amount: "150.0000", currency: "EUR" };
    },
  };

  const createDraft = new CreateReservationImportDraftUseCase(
    imports,
    unitResolver,
    catalog,
    calendarBlocks,
    availabilityRules,
    timezoneService,
    pricing,
    { generate: () => randomUUID() },
    permissionChecker,
  );
  const listDrafts = new ListReservationImportDraftsUseCase(imports, permissionChecker);
  const getDraft = new GetReservationImportDraftUseCase(imports, permissionChecker);
  const discardDraft = new DiscardReservationImportDraftUseCase(imports, permissionChecker);
  const updateStrategy = new UpdateReservationImportMissingPriceStrategyUseCase(
    imports,
    createDraft,
    permissionChecker,
  );
  const updateDecision = new UpdateReservationImportRowDecisionUseCase(
    imports,
    createDraft,
    permissionChecker,
    pricing,
  );
  const recheck = new RecheckReservationImportDraftUseCase(
    imports,
    createDraft,
    permissionChecker,
  );
  const expireUseCase = new ExpireReservationImportDraftsUseCase(imports);

  const tenantA = "550e8400-e29b-41d4-a716-4466554400a1";
  const tenantB = "550e8400-e29b-41d4-a716-4466554400b1";
  const propertyA = "550e8400-e29b-41d4-a716-4466554400a2";
  const propertyB = "550e8400-e29b-41d4-a716-4466554400b2";
  const unitA = "550e8400-e29b-41d4-a716-4466554400a3";
  const unitB = "550e8400-e29b-41d4-a716-4466554400b3";
  const actorA = "550e8400-e29b-41d4-a716-4466554400a4";
  const actorB = "550e8400-e29b-41d4-a716-4466554400b4";

  const actor: ActorContext = {
    userId: actorA,
    role: "admin",
    propertyIds: null,
  };

  beforeEach(async () => {
    talosCalls = 0;
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

  async function createConfirmedBooking(ids: {
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
    const pricingResult = new PricingCalculator().calculate(
      ratePlan,
      hold.stayPeriod,
      new Date("2026-01-01T12:00:00.000Z"),
    );
    const quote = Quote.create({
      id: randomUUID(),
      snapshotId: randomUUID(),
      hold,
      pricing: pricingResult,
      propertyTimezone: "Europe/Athens",
    });
    await quoteRepository.save(quote);
    const booking = Booking.create({
      id: ids.bookingId,
      hold,
      quote,
      guest: { name: "Existing Guest", email: "ex@test.com", phone: null },
      confirmationMode: "manual",
    });
    await holdRepository.save(hold);
    await bookingRepository.save(booking);
    booking.confirm(new Date(), mutationOriginOperator());
    await bookingRepository.save(booking);
    return booking;
  }

  function snapshotIds(row: ReservationImportRowRecord): string[] {
    const snap = row.conflictSnapshot as { existingBookingIds?: string[] };
    return [...(snap.existingBookingIds ?? [])].sort();
  }

  it("persists replaceBookingIds empty/one/multi and keeps legacy replace_booking_id compatible", async () => {
    const batch = await imports.createBatch({
      id: randomUUID(),
      tenantId: tenantA,
      propertyId: propertyA,
      actorId: actorA,
      filename: "persist.csv",
      now: new Date("2026-10-04T08:00:00.000Z"),
    });
    const idEmpty = randomUUID();
    const idOne = randomUUID();
    const idMulti = randomUUID();
    const bookingOne = "550e8400-e29b-41d4-a716-446655440301";
    const bookingA = "550e8400-e29b-41d4-a716-446655440302";
    const bookingB = "550e8400-e29b-41d4-a716-446655440303";

    await imports.createRows([
      {
        id: idEmpty,
        tenantId: tenantA,
        batchId: batch.id,
        rowNumber: 1,
        externalReference: "P-EMPTY",
        unitId: unitA,
        checkIn: "2026-12-01",
        checkOut: "2026-12-03",
        temporalClass: "future",
        guestName: "E",
        guestEmail: "e@test.com",
        guestCount: 1,
        replaceBookingIds: [],
      },
      {
        id: idOne,
        tenantId: tenantA,
        batchId: batch.id,
        rowNumber: 2,
        externalReference: "P-ONE",
        unitId: unitA,
        checkIn: "2026-12-04",
        checkOut: "2026-12-06",
        temporalClass: "future",
        guestName: "O",
        guestEmail: "o@test.com",
        guestCount: 1,
        replaceBookingIds: [],
      },
      {
        id: idMulti,
        tenantId: tenantA,
        batchId: batch.id,
        rowNumber: 3,
        externalReference: "P-MULTI",
        unitId: unitA,
        checkIn: "2026-12-07",
        checkOut: "2026-12-10",
        temporalClass: "future",
        guestName: "M",
        guestEmail: "m@test.com",
        guestCount: 1,
        replaceBookingIds: [],
      },
    ]);

    const empty = await imports.updateRow(idEmpty, tenantA, {
      replaceBookingIds: [],
      replaceBookingId: null,
      conflictResolution: "undecided",
    });
    expect(empty.replaceBookingIds).toEqual([]);
    expect(empty.replaceBookingId).toBeNull();

    const one = await imports.updateRow(idOne, tenantA, {
      replaceBookingIds: [bookingOne],
      replaceBookingId: null, // JSON is canonical; legacy FK optional when target may not exist
      conflictResolution: "keep_csv",
    });
    expect(one.replaceBookingIds).toEqual([bookingOne]);
    expect(one.replaceBookingId).toBeNull();

    const multi = await imports.updateRow(idMulti, tenantA, {
      replaceBookingIds: [bookingA, bookingB],
      replaceBookingId: null,
      conflictResolution: "keep_csv",
    });
    expect(multi.replaceBookingIds).toEqual([bookingA, bookingB]);

    const reloaded = await imports.listRowsForBatch(batch.id, tenantA);
    expect(reloaded.find((r) => r.id === idEmpty)!.replaceBookingIds).toEqual([]);
    expect(reloaded.find((r) => r.id === idOne)!.replaceBookingIds).toEqual([bookingOne]);
    expect(reloaded.find((r) => r.id === idMulti)!.replaceBookingIds).toEqual([
      bookingA,
      bookingB,
    ]);

    // Dual-source contract: replaceBookingIds is authoritative for multi; legacy column may be null/first.
    expect(reloaded.find((r) => r.id === idMulti)!.replaceBookingId).toBeNull();
  });

  it("creates multi-row draft with historical/in-progress/future temporal classes", async () => {
    const csv = [
      "external_reference,unit,guest_name,guest_email,check_in,check_out,guests,total,currency",
      `HIST,${unitA},Hist,hist@test.com,2024-07-10,2024-07-12,2,200,EUR`,
      `PROG,${unitA},Prog,prog@test.com,2026-10-01,2026-10-10,2,300,EUR`,
      `FUT,${unitA},Fut,fut@test.com,2026-12-10,2026-12-12,2,400,EUR`,
    ].join("\n");

    const result = await createDraft.execute(
      {
        tenantId: tenantA,
        propertyId: propertyA,
        filename: "temporal.csv",
        content: csv,
        dateFormat: "iso",
        now: new Date("2026-10-04T08:00:00.000Z"),
      },
      actor,
    );
    expect(result.isSuccess).toBe(true);
    const rows = result.getValue().rows;
    expect(rows).toHaveLength(3);
    expect(rows.find((r) => r.externalReference === "HIST")!.temporalClass).toBe("historical");
    expect(rows.find((r) => r.externalReference === "PROG")!.temporalClass).toBe("in_progress");
    expect(rows.find((r) => r.externalReference === "FUT")!.temporalClass).toBe("future");
    expect(rows.every((r) => r.priceSource === "imported_csv")).toBe(true);
  });

  it("enforces exact 72h TTL boundaries and blocks mutate/resume without worker cleanup", async () => {
    const createdAt = new Date("2026-10-01T10:00:00.000Z");
    const batch = await imports.createBatch({
      id: randomUUID(),
      tenantId: tenantA,
      propertyId: propertyA,
      actorId: actorA,
      filename: "ttl.csv",
      now: createdAt,
    });
    expect(batch.expiresAt.getTime() - batch.createdAt.getTime()).toBe(
      RESERVATION_IMPORT_DRAFT_TTL_MS,
    );
    const expiresAt = computeReservationImportDraftExpiresAt(createdAt);
    const justBefore = new Date(expiresAt.getTime() - 1000);

    const rowId = randomUUID();
    await imports.createRows([
      {
        id: rowId,
        tenantId: tenantA,
        batchId: batch.id,
        rowNumber: 1,
        externalReference: "TTL-1",
        unitId: unitA,
        checkIn: "2026-12-01",
        checkOut: "2026-12-03",
        temporalClass: "future",
        guestName: "T",
        guestEmail: "t@test.com",
        guestCount: 1,
        priceSource: "unresolved",
      },
    ]);

    expect(
      (await listDrafts.execute(tenantA, actor, justBefore)).getValue().some((b) => b.id === batch.id),
    ).toBe(true);
    expect((await getDraft.execute(batch.id, tenantA, actor, justBefore)).isSuccess).toBe(true);

    // Exact 72h and after: expired, rows still physically present (no expireDrafts).
    expect(await imports.listRowsForBatch(batch.id, tenantA)).toHaveLength(1);
    expect((await getDraft.execute(batch.id, tenantA, actor, expiresAt)).isFailure).toBe(true);
    expect(
      (await listDrafts.execute(tenantA, actor, expiresAt)).getValue().some((b) => b.id === batch.id),
    ).toBe(false);
    expect(
      (
        await updateDecision.execute(
          {
            batchId: batch.id,
            rowId,
            tenantId: tenantA,
            priceSource: "operator_entered",
            operatorTotalAmount: "99.0000",
            operatorCurrency: "EUR",
            now: expiresAt,
          },
          actor,
        )
      ).isFailure,
    ).toBe(true);
    expect(
      (
        await updateStrategy.execute(
          {
            batchId: batch.id,
            tenantId: tenantA,
            missingPriceStrategy: "talos_for_all_missing",
            now: new Date(expiresAt.getTime() + 1000),
          },
          actor,
        )
      ).isFailure,
    ).toBe(true);
    expect((await recheck.execute(batch.id, tenantA, actor, expiresAt)).isFailure).toBe(true);
    expect(await imports.listRowsForBatch(batch.id, tenantA)).toHaveLength(1);
  });

  it("applies missing-price strategies: talos-for-all and operator-entered", async () => {
    const csv = [
      "external_reference,unit,guest_name,guest_email,check_in,check_out,guests",
      `NOPRICE,${unitA},NoPrice,np@test.com,2026-12-20,2026-12-22,2`,
    ].join("\n");
    const created = await createDraft.execute(
      {
        tenantId: tenantA,
        propertyId: propertyA,
        filename: "price.csv",
        content: csv,
        dateFormat: "iso",
        now: new Date("2026-10-04T08:00:00.000Z"),
      },
      actor,
    );
    expect(created.isSuccess).toBe(true);
    const batchId = created.getValue().batch.id;
    const rowId = created.getValue().rows[0]!.id;
    expect(created.getValue().rows[0]!.priceSource).toBe("unresolved");

    const talosAll = await updateStrategy.execute(
      {
        batchId,
        tenantId: tenantA,
        missingPriceStrategy: "talos_for_all_missing",
        now: new Date("2026-10-04T09:00:00.000Z"),
      },
      actor,
    );
    expect(talosAll.isSuccess).toBe(true);
    expect(talosAll.getValue().rows[0]!.priceSource).toBe("talos_calculated");
    expect(talosAll.getValue().rows[0]!.operatorTotalAmount).toMatch(/^150(\.0+)?$/);
    expect(talosCalls).toBeGreaterThan(0);

    const op = await updateDecision.execute(
      {
        batchId,
        rowId,
        tenantId: tenantA,
        priceSource: "operator_entered",
        operatorTotalAmount: "222.5000",
        operatorCurrency: "EUR",
        now: new Date("2026-10-04T09:05:00.000Z"),
      },
      actor,
    );
    expect(op.isSuccess).toBe(true);
    expect(op.getValue().priceSource).toBe("operator_entered");
    expect(op.getValue().operatorTotalAmount).toMatch(/^222\.5(0+)?$/);
  });

  it("detects multi-existing-booking overlap and persists full replaceBookingIds on keep_csv", async () => {
    const bookingA = "550e8400-e29b-41d4-a716-446655440401";
    const bookingB = "550e8400-e29b-41d4-a716-446655440402";
    await createConfirmedBooking({
      tenantId: tenantA,
      propertyId: propertyA,
      unitId: unitA,
      bookingId: bookingA,
      checkIn: "2026-11-10",
      checkOut: "2026-11-12",
    });
    await createConfirmedBooking({
      tenantId: tenantA,
      propertyId: propertyA,
      unitId: unitA,
      bookingId: bookingB,
      checkIn: "2026-11-12",
      checkOut: "2026-11-14",
    });

    const csv = [
      "external_reference,unit,guest_name,guest_email,check_in,check_out,guests,total,currency",
      `X-MULTI,${unitA},X,x@test.com,2026-11-10,2026-11-14,2,900,EUR`,
    ].join("\n");
    const created = await createDraft.execute(
      {
        tenantId: tenantA,
        propertyId: propertyA,
        filename: "multi-conflict.csv",
        content: csv,
        dateFormat: "iso",
        now: new Date("2026-10-04T08:00:00.000Z"),
      },
      actor,
    );
    expect(created.isSuccess).toBe(true);
    const row = created.getValue().rows[0]!;
    expect(snapshotIds(row).sort()).toEqual([bookingA, bookingB].sort());
    expect(row.conflictGroupId).toBeTruthy();

    const decided = await updateDecision.execute(
      {
        batchId: created.getValue().batch.id,
        rowId: row.id,
        tenantId: tenantA,
        conflictResolution: "keep_csv",
        now: new Date("2026-10-04T08:30:00.000Z"),
      },
      actor,
    );
    expect(decided.isSuccess).toBe(true);
    const out = decided.getValue();
    expect([...out.replaceBookingIds].sort()).toEqual([bookingA, bookingB].sort());
    expect(out.replaceBookingId).toBe(out.replaceBookingIds[0] ?? null);

    // B2 must not supersede existing bookings.
    const stillA = await bookingRepository.findById(bookingA, tenantA);
    const stillB = await bookingRepository.findById(bookingB, tenantA);
    expect(stillA).toBeTruthy();
    expect(stillB).toBeTruthy();
    expect(stillA!.isSuperseded).toBe(false);
    expect(stillB!.isSuperseded).toBe(false);
  });

  it("detects import-vs-import overlap with shared conflict group", async () => {
    const csv = [
      "external_reference,unit,guest_name,guest_email,check_in,check_out,guests,total,currency",
      `PEER-1,${unitA},P1,p1@test.com,2026-12-01,2026-12-05,2,100,EUR`,
      `PEER-2,${unitA},P2,p2@test.com,2026-12-03,2026-12-07,2,100,EUR`,
    ].join("\n");
    const created = await createDraft.execute(
      {
        tenantId: tenantA,
        propertyId: propertyA,
        filename: "peers.csv",
        content: csv,
        dateFormat: "iso",
        now: new Date("2026-10-04T08:00:00.000Z"),
      },
      actor,
    );
    expect(created.isSuccess).toBe(true);
    const [r1, r2] = created.getValue().rows;
    expect(r1!.conflictGroupId).toBeTruthy();
    expect(r1!.conflictGroupId).toBe(r2!.conflictGroupId);
    const snap1 = r1!.conflictSnapshot as { peerImportRowIds?: string[] };
    const snap2 = r2!.conflictSnapshot as { peerImportRowIds?: string[] };
    expect(snap1.peerImportRowIds).toContain(r2!.id);
    expect(snap2.peerImportRowIds).toContain(r1!.id);
  });

  it("marks non-booking blockers as failed (no replace choice)", async () => {
    await withTenantTransaction(tenantA, async (tx) => {
      await tx.unitCalendarBlock.create({
        data: {
          id: randomUUID(),
          tenantId: tenantA,
          unitId: unitA,
          propertyId: propertyA,
          checkIn: new Date("2026-12-15T00:00:00.000Z"),
          checkOut: new Date("2026-12-18T00:00:00.000Z"),
          blockType: "owner",
          status: "active",
          reason: "owner hold",
        },
      });
    });

    const csv = [
      "external_reference,unit,guest_name,guest_email,check_in,check_out,guests,total,currency",
      `OWN-BLOCK,${unitA},Own,own@test.com,2026-12-16,2026-12-17,2,100,EUR`,
    ].join("\n");
    const created = await createDraft.execute(
      {
        tenantId: tenantA,
        propertyId: propertyA,
        filename: "owner.csv",
        content: csv,
        dateFormat: "iso",
        now: new Date("2026-10-04T08:00:00.000Z"),
      },
      actor,
    );
    expect(created.isSuccess).toBe(true);
    const row = created.getValue().rows[0]!;
    expect(row.status).toBe("failed");
    expect(row.errorCode).toMatch(/BLOCKED_BY_OWNER/i);
  });

  it("detects already-imported durable identity and supports recheck invalidation + discard + expire cleanup", async () => {
    const durableBatchId = randomUUID();
    const durableRowId = randomUUID();
    await withTenantTransaction(tenantA, async (tx) => {
      await tx.reservationImportBatch.create({
        data: {
          id: durableBatchId,
          tenantId: tenantA,
          propertyId: propertyA,
          actorId: actorA,
          sourceNamespace: "csv_reservation_import",
          filename: "durable.csv",
          rowCount: 1,
          status: "completed",
          missingPriceStrategy: "undecided",
          expiresAt: new Date("2026-09-02T00:00:00.000Z"),
          committedAt: new Date("2026-09-01T01:00:00.000Z"),
        },
      });
      await tx.reservationImportRow.create({
        data: {
          id: durableRowId,
          tenantId: tenantA,
          batchId: durableBatchId,
          rowNumber: 1,
          sourceNamespace: "csv_reservation_import",
          externalReference: "ALREADY-1",
          unitId: unitA,
          checkIn: new Date("2026-08-01T00:00:00.000Z"),
          checkOut: new Date("2026-08-03T00:00:00.000Z"),
          temporalClass: "historical",
          guestName: "Old",
          guestEmail: "old@test.com",
          guestCount: 1,
          status: "imported",
          priceSource: "imported_csv",
          importedTotalAmount: "50.0000",
          importedCurrency: "EUR",
          replaceBookingIds: [],
          conflictSnapshot: {},
          payload: {},
        },
      });
    });

    const csv = [
      "external_reference,unit,guest_name,guest_email,check_in,check_out,guests,total,currency",
      `ALREADY-1,${unitA},Again,again@test.com,2026-12-01,2026-12-03,2,80,EUR`,
    ].join("\n");
    const created = await createDraft.execute(
      {
        tenantId: tenantA,
        propertyId: propertyA,
        filename: "again.csv",
        content: csv,
        dateFormat: "iso",
        now: new Date("2026-10-04T08:00:00.000Z"),
      },
      actor,
    );
    expect(created.isSuccess).toBe(true);
    expect(created.getValue().rows[0]!.status).toBe("skipped");
    expect(created.getValue().rows[0]!.errorCode).toBe("ALREADY_IMPORTED");

    // Recheck invalidates prior conflict decisions
    const bookingId = "550e8400-e29b-41d4-a716-446655440501";
    await createConfirmedBooking({
      tenantId: tenantA,
      propertyId: propertyA,
      unitId: unitA,
      bookingId,
      checkIn: "2026-12-10",
      checkOut: "2026-12-12",
    });
    const conflictCsv = [
      "external_reference,unit,guest_name,guest_email,check_in,check_out,guests,total,currency",
      `RECHK,${unitA},R,r@test.com,2026-12-10,2026-12-12,2,80,EUR`,
    ].join("\n");
    const conflictDraft = await createDraft.execute(
      {
        tenantId: tenantA,
        propertyId: propertyA,
        filename: "rechk.csv",
        content: conflictCsv,
        dateFormat: "iso",
        now: new Date("2026-10-04T08:00:00.000Z"),
      },
      actor,
    );
    const cBatch = conflictDraft.getValue().batch.id;
    const cRow = conflictDraft.getValue().rows[0]!;
    await updateDecision.execute(
      {
        batchId: cBatch,
        rowId: cRow.id,
        tenantId: tenantA,
        conflictResolution: "keep_csv",
        now: new Date("2026-10-04T08:10:00.000Z"),
      },
      actor,
    );
    const afterRecheck = await recheck.execute(
      cBatch,
      tenantA,
      actor,
      new Date("2026-10-04T08:20:00.000Z"),
    );
    expect(afterRecheck.isSuccess).toBe(true);
    const recheckedRow = afterRecheck.getValue().rows[0]!;
    expect(recheckedRow.conflictResolution).toBe("undecided");
    expect(recheckedRow.replaceBookingIds).toEqual([]);

    // Discard
    const discarded = await discardDraft.execute(
      cBatch,
      tenantA,
      actor,
      new Date("2026-10-04T08:30:00.000Z"),
    );
    expect(discarded.isSuccess).toBe(true);
    expect(discarded.getValue().status).toBe("cancelled");

    // Physical expiry cleanup (worker job path)
    const expireBatch = await imports.createBatch({
      id: randomUUID(),
      tenantId: tenantA,
      propertyId: propertyA,
      actorId: actorA,
      filename: "to-expire.csv",
      now: new Date("2026-10-01T00:00:00.000Z"),
    });
    await imports.createRows([
      {
        id: randomUUID(),
        tenantId: tenantA,
        batchId: expireBatch.id,
        rowNumber: 1,
        externalReference: "EXP-ROW",
        unitId: unitA,
        checkIn: "2026-12-01",
        checkOut: "2026-12-02",
        temporalClass: "future",
        guestName: "E",
        guestEmail: "e@test.com",
        guestCount: 1,
      },
    ]);
    await withTenantTransaction(tenantA, async (tx) => {
      await tx.reservationImportBatch.update({
        where: { id: expireBatch.id },
        data: { expiresAt: new Date("2026-10-02T00:00:00.000Z") },
      });
    });
    const expired = await expireUseCase.execute(new Date("2026-10-04T00:00:00.000Z"), 50);
    expect(expired.isSuccess).toBe(true);
    expect(expired.getValue().expiredBatches).toBeGreaterThanOrEqual(1);
    expect((await imports.findBatchById(expireBatch.id, tenantA))!.status).toBe("expired");
    expect(await imports.listRowsForBatch(expireBatch.id, tenantA)).toHaveLength(0);
  });

  it("enforces tenant read and mutation isolation", async () => {
    const batch = await imports.createBatch({
      id: randomUUID(),
      tenantId: tenantA,
      propertyId: propertyA,
      actorId: actorA,
      filename: "iso.csv",
    });
    expect(await imports.findBatchById(batch.id, tenantB)).toBeNull();
    expect(
      (await listDrafts.execute(tenantB, {
        userId: actorB,
        role: "admin",
        propertyIds: null,
      })).getValue().some((b) => b.id === batch.id),
    ).toBe(false);
    await expect(
      imports.updateBatch(batch.id, tenantB, { rowCount: 99 }),
    ).rejects.toThrow();
  });
});
