/**
 * B3.3a database-backed verification:
 * BLOCKED/readiness, CSV exclusivity, rejected rows, discard/expiry, concurrency.
 */
import { randomUUID } from "node:crypto";
import { expect, beforeEach, afterAll, it } from "vitest";
import {
  Booking,
  Hold,
  Quote,
  PricingCalculator,
  CreateReservationImportDraftUseCase,
  RecheckReservationImportDraftUseCase,
  GetReservationImportDraftUseCase,
  DiscardReservationImportDraftUseCase,
  UpdateReservationImportRowDecisionUseCase,
  ExpireReservationImportDraftsUseCase,
  PermissionChecker,
  mutationOriginOperator,
  type ActorContext,
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

runIntegration("Reservation import B3.3a", () => {
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
  const pricing = {
    async previewTotal() {
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
  const getDraft = new GetReservationImportDraftUseCase(imports, permissionChecker);
  const discardDraft = new DiscardReservationImportDraftUseCase(imports, permissionChecker);
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
  const actor: ActorContext = { userId: actorA, role: "admin", propertyIds: null };

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

  it("BLOCKED/readiness: unresolved pending, keep_existing skipped, keep_csv ready; blockers failed", async () => {
    const bookingId = "550e8400-e29b-41d4-a716-446655441001";
    await createConfirmedBooking({
      tenantId: tenantA,
      propertyId: propertyA,
      unitId: unitA,
      bookingId,
      checkIn: "2026-11-10",
      checkOut: "2026-11-14",
    });

    const csv = [
      "external_reference,unit,guest_name,guest_email,check_in,check_out,guests,total,currency",
      `BLK-1,${unitA},G,g@test.com,2026-11-10,2026-11-14,2,100,EUR`,
    ].join("\n");
    const created = await createDraft.execute(
      {
        tenantId: tenantA,
        filename: "blocked.csv",
        content: csv,
        dateFormat: "iso",
        now: new Date("2026-10-04T08:00:00.000Z"),
      },
      actor,
    );
    expect(created.isSuccess).toBe(true);
    const row = created.getValue().rows[0]!;
    expect(row.status).toBe("pending");
    expect(row.errorCode).not.toBe("BLOCKED");
    expect(row.errorCode).not.toBe("DATES_BLOCKED");
    const snap = row.conflictSnapshot as { existingBookingIds?: string[] };
    expect(snap.existingBookingIds).toContain(bookingId);

    const keepExisting = await updateDecision.execute(
      {
        batchId: created.getValue().batch.id,
        rowId: row.id,
        tenantId: tenantA,
        conflictResolution: "keep_existing",
        now: new Date("2026-10-04T08:10:00.000Z"),
      },
      actor,
    );
    expect(keepExisting.isSuccess).toBe(true);
    expect(keepExisting.getValue().status).toBe("skipped");

    // Recreate draft for keep_csv path
    const created2 = await createDraft.execute(
      {
        tenantId: tenantA,
        filename: "blocked2.csv",
        content: csv.replace("BLK-1", "BLK-2"),
        dateFormat: "iso",
        now: new Date("2026-10-04T08:20:00.000Z"),
      },
      actor,
    );
    const row2 = created2.getValue().rows[0]!;
    const keepCsv = await updateDecision.execute(
      {
        batchId: created2.getValue().batch.id,
        rowId: row2.id,
        tenantId: tenantA,
        conflictResolution: "keep_csv",
        now: new Date("2026-10-04T08:30:00.000Z"),
      },
      actor,
    );
    expect(keepCsv.isSuccess).toBe(true);
    expect(keepCsv.getValue().status).toBe("ready");
    expect(keepCsv.getValue().replaceBookingIds).toEqual([bookingId]);
    // Stale evaluator BLOCKED must not keep a resolved conflict pending
    expect(keepCsv.getValue().errorCode).toBeNull();

    await withTenantTransaction(tenantA, async (tx) => {
      await tx.unitCalendarBlock.create({
        data: {
          id: randomUUID(),
          tenantId: tenantA,
          unitId: unitA,
          propertyId: propertyA,
          checkIn: new Date("2026-12-15T00:00:00.000Z"),
          checkOut: new Date("2026-12-18T00:00:00.000Z"),
          blockType: "maintenance",
          status: "active",
          reason: "maintenance",
        },
      });
    });
    const blocked = await createDraft.execute(
      {
        tenantId: tenantA,
        filename: "maint.csv",
        content: [
          "external_reference,unit,guest_name,guest_email,check_in,check_out,guests,total,currency",
          `M1,${unitA},M,m@test.com,2026-12-16,2026-12-17,2,100,EUR`,
        ].join("\n"),
        dateFormat: "iso",
        now: new Date("2026-10-04T09:00:00.000Z"),
      },
      actor,
    );
    expect(blocked.getValue().rows[0]!.status).toBe("failed");
    expect(blocked.getValue().rows[0]!.errorCode).toMatch(/BLOCKED_BY_MAINTENANCE/i);
  });

  it("pair exclusivity: overlapping keep_csv never both survive; boundary may both survive", async () => {
    const pairCsv = [
      "external_reference,unit,guest_name,guest_email,check_in,check_out,guests,total,currency",
      `A,${unitA},A,a@test.com,2026-10-10,2026-10-14,2,100,EUR`,
      `B,${unitA},B,b@test.com,2026-10-12,2026-10-16,2,100,EUR`,
    ].join("\n");
    const pair = await createDraft.execute(
      {
        tenantId: tenantA,
        filename: "pair.csv",
        content: pairCsv,
        dateFormat: "iso",
        now: new Date("2026-10-04T08:00:00.000Z"),
      },
      actor,
    );
    const [a, b] = pair.getValue().rows;
    await updateDecision.execute(
      {
        batchId: pair.getValue().batch.id,
        rowId: a!.id,
        tenantId: tenantA,
        conflictResolution: "keep_csv",
        now: new Date("2026-10-04T08:05:00.000Z"),
      },
      actor,
    );
    await updateDecision.execute(
      {
        batchId: pair.getValue().batch.id,
        rowId: b!.id,
        tenantId: tenantA,
        conflictResolution: "keep_csv",
        now: new Date("2026-10-04T08:06:00.000Z"),
      },
      actor,
    );
    const after = await imports.listRowsForBatch(pair.getValue().batch.id, tenantA);
    const keepCsvCount = after.filter((r) => r.conflictResolution === "keep_csv").length;
    expect(keepCsvCount).toBe(1);
    expect(after.find((r) => r.id === b!.id)!.conflictResolution).toBe("keep_csv");
    expect(after.find((r) => r.id === a!.id)!.conflictResolution).toBe("keep_existing");

    const boundaryCsv = [
      "external_reference,unit,guest_name,guest_email,check_in,check_out,guests,total,currency",
      `BA,${unitA},A,a@test.com,2026-11-10,2026-11-12,2,100,EUR`,
      `BB,${unitA},B,b@test.com,2026-11-12,2026-11-14,2,100,EUR`,
    ].join("\n");
    const boundary = await createDraft.execute(
      {
        tenantId: tenantA,
        filename: "boundary.csv",
        content: boundaryCsv,
        dateFormat: "iso",
        now: new Date("2026-10-04T08:10:00.000Z"),
      },
      actor,
    );
    const [ba, bb] = boundary.getValue().rows;
    await updateDecision.execute(
      {
        batchId: boundary.getValue().batch.id,
        rowId: ba!.id,
        tenantId: tenantA,
        conflictResolution: "keep_csv",
        now: new Date("2026-10-04T08:11:00.000Z"),
      },
      actor,
    );
    await updateDecision.execute(
      {
        batchId: boundary.getValue().batch.id,
        rowId: bb!.id,
        tenantId: tenantA,
        conflictResolution: "keep_csv",
        now: new Date("2026-10-04T08:12:00.000Z"),
      },
      actor,
    );
    const boundaryRows = await imports.listRowsForBatch(
      boundary.getValue().batch.id,
      tenantA,
    );
    expect(
      boundaryRows.filter((r) => r.conflictResolution === "keep_csv").map((r) => r.id).sort(),
    ).toEqual([ba!.id, bb!.id].sort());
  });

  it("chain A/B/C: A+C may survive; A+B may not", async () => {
    const csv = [
      "external_reference,unit,guest_name,guest_email,check_in,check_out,guests,total,currency",
      `CA,${unitA},A,a@test.com,2026-10-10,2026-10-12,2,100,EUR`,
      `CB,${unitA},B,b@test.com,2026-10-11,2026-10-13,2,100,EUR`,
      `CC,${unitA},C,c@test.com,2026-10-12,2026-10-14,2,100,EUR`,
    ].join("\n");
    const draft = await createDraft.execute(
      {
        tenantId: tenantA,
        filename: "chain.csv",
        content: csv,
        dateFormat: "iso",
        now: new Date("2026-10-04T08:00:00.000Z"),
      },
      actor,
    );
    const rows = draft.getValue().rows;
    const a = rows.find((r) => r.externalReference === "CA")!;
    const b = rows.find((r) => r.externalReference === "CB")!;
    const c = rows.find((r) => r.externalReference === "CC")!;
    const batchId = draft.getValue().batch.id;

    await updateDecision.execute(
      {
        batchId,
        rowId: a.id,
        tenantId: tenantA,
        conflictResolution: "keep_csv",
        now: new Date("2026-10-04T08:01:00.000Z"),
      },
      actor,
    );
    await updateDecision.execute(
      {
        batchId,
        rowId: c.id,
        tenantId: tenantA,
        conflictResolution: "keep_csv",
        now: new Date("2026-10-04T08:02:00.000Z"),
      },
      actor,
    );
    let listed = await imports.listRowsForBatch(batchId, tenantA);
    expect(listed.find((r) => r.id === a.id)!.conflictResolution).toBe("keep_csv");
    expect(listed.find((r) => r.id === c.id)!.conflictResolution).toBe("keep_csv");

    await updateDecision.execute(
      {
        batchId,
        rowId: b.id,
        tenantId: tenantA,
        conflictResolution: "keep_csv",
        now: new Date("2026-10-04T08:03:00.000Z"),
      },
      actor,
    );
    listed = await imports.listRowsForBatch(batchId, tenantA);
    expect(listed.find((r) => r.id === b.id)!.conflictResolution).toBe("keep_csv");
    // A and C overlap B; both demoted
    expect(listed.find((r) => r.id === a.id)!.conflictResolution).toBe("keep_existing");
    expect(listed.find((r) => r.id === c.id)!.conflictResolution).toBe("keep_existing");
  });

  it("multi-existing bookings: keep_csv preserves replaceBookingIds for E1+E2; no supersede", async () => {
    const e1 = "550e8400-e29b-41d4-a716-446655441101";
    const e2 = "550e8400-e29b-41d4-a716-446655441102";
    await createConfirmedBooking({
      tenantId: tenantA,
      propertyId: propertyA,
      unitId: unitA,
      bookingId: e1,
      checkIn: "2026-11-10",
      checkOut: "2026-11-12",
    });
    await createConfirmedBooking({
      tenantId: tenantA,
      propertyId: propertyA,
      unitId: unitA,
      bookingId: e2,
      checkIn: "2026-11-12",
      checkOut: "2026-11-14",
    });
    const created = await createDraft.execute(
      {
        tenantId: tenantA,
        filename: "multi.csv",
        content: [
          "external_reference,unit,guest_name,guest_email,check_in,check_out,guests,total,currency",
          `X,${unitA},X,x@test.com,2026-11-10,2026-11-14,2,900,EUR`,
        ].join("\n"),
        dateFormat: "iso",
        now: new Date("2026-10-04T08:00:00.000Z"),
      },
      actor,
    );
    const row = created.getValue().rows[0]!;
    const decided = await updateDecision.execute(
      {
        batchId: created.getValue().batch.id,
        rowId: row.id,
        tenantId: tenantA,
        conflictResolution: "keep_csv",
        now: new Date("2026-10-04T08:10:00.000Z"),
      },
      actor,
    );
    expect([...decided.getValue().replaceBookingIds].sort()).toEqual([e1, e2].sort());
    expect((await bookingRepository.findById(e1, tenantA))!.isSuperseded).toBe(false);
    expect((await bookingRepository.findById(e2, tenantA))!.isSuperseded).toBe(false);
  });

  it("recheck clears stale decisions/replacement IDs and rebuilt conflicts still obey exclusivity", async () => {
    const csv = [
      "external_reference,unit,guest_name,guest_email,check_in,check_out,guests,total,currency",
      `RA,${unitA},A,a@test.com,2026-12-01,2026-12-05,2,100,EUR`,
      `RB,${unitA},B,b@test.com,2026-12-03,2026-12-07,2,100,EUR`,
    ].join("\n");
    const draft = await createDraft.execute(
      {
        tenantId: tenantA,
        filename: "recheck.csv",
        content: csv,
        dateFormat: "iso",
        now: new Date("2026-10-04T08:00:00.000Z"),
      },
      actor,
    );
    const batchId = draft.getValue().batch.id;
    const [a, b] = draft.getValue().rows;
    await updateDecision.execute(
      {
        batchId,
        rowId: a!.id,
        tenantId: tenantA,
        conflictResolution: "keep_csv",
        now: new Date("2026-10-04T08:05:00.000Z"),
      },
      actor,
    );
    const afterRecheck = await recheck.execute(
      batchId,
      tenantA,
      actor,
      new Date("2026-10-04T08:20:00.000Z"),
    );
    expect(afterRecheck.isSuccess).toBe(true);
    for (const r of afterRecheck.getValue().rows) {
      expect(r.conflictResolution).toBe("undecided");
      expect(r.replaceBookingIds).toEqual([]);
    }
    await updateDecision.execute(
      {
        batchId,
        rowId: a!.id,
        tenantId: tenantA,
        conflictResolution: "keep_csv",
        now: new Date("2026-10-04T08:25:00.000Z"),
      },
      actor,
    );
    await updateDecision.execute(
      {
        batchId,
        rowId: b!.id,
        tenantId: tenantA,
        conflictResolution: "keep_csv",
        now: new Date("2026-10-04T08:26:00.000Z"),
      },
      actor,
    );
    const listed = await imports.listRowsForBatch(batchId, tenantA);
    expect(listed.filter((r) => r.conflictResolution === "keep_csv")).toHaveLength(1);
  });

  it("rejected rows persist, isolate, block PATCH, cleanup on discard/expiry, and do not block valid readiness", async () => {
    const csv = [
      "external_reference,unit,guest_name,guest_email,check_in,check_out,guests,total,currency",
      `OK,${unitA},Ok,ok@test.com,2026-12-20,2026-12-22,2,100,EUR`,
      `BAD,unknown-unit-xyz,Bad,bad@test.com,2026-12-20,2026-12-22,2,100,EUR`,
    ].join("\n");
    const created = await createDraft.execute(
      {
        tenantId: tenantA,
        filename: "rej.csv",
        content: csv,
        dateFormat: "iso",
        now: new Date("2026-10-04T08:00:00.000Z"),
      },
      actor,
    );
    expect(created.isSuccess).toBe(true);
    expect(created.getValue().rows).toHaveLength(1);
    expect(created.getValue().rows[0]!.status).toBe("ready");
    expect(created.getValue().rejectedRows).toHaveLength(1);
    const rejected = created.getValue().rejectedRows[0]!;
    expect(rejected.payload).not.toHaveProperty("raw");
    expect(JSON.stringify(rejected.payload)).not.toContain(csv);
    expect(rejected.errors.length).toBeGreaterThan(0);

    const reloaded = await getDraft.execute(
      created.getValue().batch.id,
      tenantA,
      actor,
      new Date("2026-10-04T08:05:00.000Z"),
    );
    expect(reloaded.isSuccess).toBe(true);
    expect(reloaded.getValue().rejectedRows).toHaveLength(1);
    expect(reloaded.getValue().rows).toHaveLength(1);
    expect(reloaded.getValue().rows.some((r) => r.id === rejected.id)).toBe(false);

    // Tenant isolation
    expect(
      await imports.listRejectedRowsForBatch(created.getValue().batch.id, tenantB),
    ).toHaveLength(0);

    // Normal row PATCH cannot mutate rejected row id
    await expect(
      imports.updateRow(rejected.id, tenantA, { status: "ready" }),
    ).rejects.toThrow();

    // JSON round-trip of errors/warnings
    const raw = await withTenantTransaction(tenantA, async (tx) =>
      tx.reservationImportRejectedRow.findFirst({
        where: { id: rejected.id, tenantId: tenantA },
      }),
    );
    expect(raw).toBeTruthy();
    expect(Array.isArray(raw!.errors)).toBe(true);

    const discarded = await discardDraft.execute(
      created.getValue().batch.id,
      tenantA,
      actor,
      new Date("2026-10-04T08:10:00.000Z"),
    );
    expect(discarded.isSuccess).toBe(true);
    expect(
      await imports.listRejectedRowsForBatch(created.getValue().batch.id, tenantA),
    ).toHaveLength(0);

    // Expiry removes rejected diagnostics
    const expireDraft = await createDraft.execute(
      {
        tenantId: tenantA,
        filename: "rej-exp.csv",
        content: csv,
        dateFormat: "iso",
        now: new Date("2026-10-01T00:00:00.000Z"),
      },
      actor,
    );
    const expBatchId = expireDraft.getValue().batch.id;
    expect(expireDraft.getValue().rejectedRows).toHaveLength(1);
    await withTenantTransaction(tenantA, async (tx) => {
      await tx.reservationImportBatch.update({
        where: { id: expBatchId },
        data: { expiresAt: new Date("2026-10-02T00:00:00.000Z") },
      });
    });
    const expired = await expireUseCase.execute(new Date("2026-10-04T00:00:00.000Z"), 50);
    expect(expired.isSuccess).toBe(true);
    expect(await imports.listRejectedRowsForBatch(expBatchId, tenantA)).toHaveLength(0);
  });

  it("real concurrency: dual overlapping keep_csv attempts never both commit", async () => {
    const csv = [
      "external_reference,unit,guest_name,guest_email,check_in,check_out,guests,total,currency",
      `CA,${unitA},A,a@test.com,2026-10-10,2026-10-14,2,100,EUR`,
      `CB,${unitA},B,b@test.com,2026-10-12,2026-10-16,2,100,EUR`,
    ].join("\n");
    const draft = await createDraft.execute(
      {
        tenantId: tenantA,
        filename: "conc.csv",
        content: csv,
        dateFormat: "iso",
        now: new Date("2026-10-04T08:00:00.000Z"),
      },
      actor,
    );
    const batchId = draft.getValue().batch.id;
    const [a, b] = draft.getValue().rows;

    const [r1, r2] = await Promise.all([
      updateDecision.execute(
        {
          batchId,
          rowId: a!.id,
          tenantId: tenantA,
          conflictResolution: "keep_csv",
          now: new Date("2026-10-04T08:05:00.000Z"),
        },
        actor,
      ),
      updateDecision.execute(
        {
          batchId,
          rowId: b!.id,
          tenantId: tenantA,
          conflictResolution: "keep_csv",
          now: new Date("2026-10-04T08:05:00.000Z"),
        },
        actor,
      ),
    ]);

    // Acceptable: one/both succeed with demotion; or one fails validation — never dual keep_csv.
    const listed = await imports.listRowsForBatch(batchId, tenantA);
    const keepCsv = listed.filter((r) => r.conflictResolution === "keep_csv");
    expect(keepCsv.length).toBeLessThanOrEqual(1);
    if (keepCsv.length === 1) {
      // Partial decision state must not leave both undecided with half-applied replace ids incorrectly
      const other = listed.find((r) => r.id !== keepCsv[0]!.id)!;
      expect(other.conflictResolution === "keep_existing" || other.conflictResolution === "undecided").toBe(
        true,
      );
    }
    // At least one attempt should complete without throwing dual-keep_csv into DB
    expect(r1.isSuccess || r2.isSuccess).toBe(true);
  });

  it("local schema: rejected-row cascade on batch delete + tenant policy identity", async () => {
    const batch = await imports.createBatch({
      id: randomUUID(),
      tenantId: tenantA,
      actorId: actorA,
      filename: "cascade.csv",
    });
    await imports.createRejectedRows([
      {
        id: randomUUID(),
        tenantId: tenantA,
        batchId: batch.id,
        rowNumber: 9,
        payload: { externalReference: "Z" },
        errors: [{ code: "X", severity: "error", message: "m", rowNumber: 9 }],
        warnings: [],
      },
    ]);
    expect(await imports.listRejectedRowsForBatch(batch.id, tenantA)).toHaveLength(1);
    await withTenantTransaction(tenantA, async (tx) => {
      await tx.reservationImportBatch.delete({ where: { id: batch.id } });
    });
    expect(await imports.listRejectedRowsForBatch(batch.id, tenantA)).toHaveLength(0);
  });
});
