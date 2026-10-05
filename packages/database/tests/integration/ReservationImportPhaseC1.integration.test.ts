import { randomUUID } from "node:crypto";
import { it, expect, beforeEach, afterAll } from "vitest";
import {
  Booking,
  Hold,
  Quote,
  PricingCalculator,
  CreateReservationImportDraftUseCase,
  UpdateReservationImportRowDecisionUseCase,
  CommitReservationImportBatchUseCase,
  PermissionChecker,
  ResolveOrCreateGuest,
  mutationOriginOperator,
  Money,
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
import { PrismaCommerceFlowRepository } from "../../src/repositories/commerce/CommerceFlowRepository";
import { PrismaGuestRepository } from "../../src/repositories/guests/GuestRepository";
import { PrismaOutboxRepository } from "../../src/repositories/OutboxRepository";
import { TimezoneService } from "../../src/adapters/TimezoneService";
import { withTenantTransaction } from "../../src/client";
import {
  persistHoldTx,
  persistQuoteTx,
  persistBookingTx,
} from "../../src/repositories/commerce/commercePersistence";
import { truncateIntegrationTables, prisma } from "./helpers";
import { seedCommerceFixture } from "./commerceFixtures";
import { runIntegration } from "./integrationGate";
import { applyIntegrationTestDatabaseEnv } from "../../src/safety/databaseTargetGuard";

runIntegration("Reservation import Phase C1 commit", () => {
  const outboxRepository = new PrismaOutboxRepository();
  const holdRepository = new PrismaHoldRepository(outboxRepository);
  const quoteRepository = new PrismaQuoteRepository(outboxRepository);
  const bookingRepository = new PrismaBookingRepository(outboxRepository);
  const ratePlanRepository = new PrismaRatePlanRepository();
  const commerceFlow = new PrismaCommerceFlowRepository(outboxRepository);
  const imports = new PrismaReservationImportRepository();
  const unitResolver = new PrismaCsvImportUnitResolver();
  const catalog = new PrismaCatalogQueryAdapter();
  const calendarBlocks = new PrismaCalendarBlockRepository();
  const availabilityRules = new PrismaAvailabilityRulesRepository();
  const timezoneService = new TimezoneService();
  const permissionChecker = new PermissionChecker();
  const guestRepository = new PrismaGuestRepository();
  const idGenerator = { generate: () => randomUUID() };
  const resolveOrCreateGuest = new ResolveOrCreateGuest(
    guestRepository,
    idGenerator,
    permissionChecker,
  );

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
    idGenerator,
    permissionChecker,
  );
  const updateDecision = new UpdateReservationImportRowDecisionUseCase(
    imports,
    createDraft,
    permissionChecker,
    pricing,
  );
  const commit = new CommitReservationImportBatchUseCase(
    imports,
    commerceFlow,
    bookingRepository,
    catalog,
    calendarBlocks,
    availabilityRules,
    timezoneService,
    resolveOrCreateGuest,
    idGenerator,
    permissionChecker,
  );

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
    // Safety: local hcp_test only
    const status = applyIntegrationTestDatabaseEnv();
    expect(status).toBe("configured");
    const url = process.env.DATABASE_URL ?? "";
    expect(url).toMatch(/127\.0\.0\.1/);
    expect(url).toMatch(/hcp_test/);
    expect(process.env.ALLOW_TALOS_PRODUCTION_DB_MUTATION).toBeUndefined();

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
      guest: { name: "Existing", email: "ex@test.com", phone: null },
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
      guest: { name: "Live", email: "live@test.com", phone: null },
      confirmationMode: "manual",
    });
    await holdRepository.save(hold);
    await bookingRepository.save(booking);
    booking.confirm(new Date(), mutationOriginOperator());
    await bookingRepository.save(booking);
    return booking;
  }

  async function activeBookingBlocks(unitId: string, tenantId: string) {
    return calendarBlocks.findActiveBlocks(unitId, tenantId).then((blocks) =>
      blocks.filter((b) => b.blockType === "booking" && b.status === "active"),
    );
  }

  it("1) normal ready import creates booking and completes batch", async () => {
    const csv = [
      "external_reference,unit,guest_name,guest_email,check_in,check_out,guests,total,currency",
      `C1-NORMAL,${unitA},Normal,n@test.com,2026-12-01,2026-12-04,2,300,EUR`,
    ].join("\n");
    const created = await createDraft.execute(
      {
        tenantId: tenantA,
        propertyId: propertyA,
        filename: "normal.csv",
        content: csv,
        dateFormat: "iso",
        now: new Date("2026-10-04T08:00:00.000Z"),
      },
      actor,
    );
    expect(created.isSuccess).toBe(true);
    expect(created.getValue().rows[0]!.status).toBe("ready");

    const result = await commit.execute(
      created.getValue().batch.id,
      tenantA,
      actor,
      new Date("2026-10-04T09:00:00.000Z"),
    );
    expect(result.isSuccess).toBe(true);
    if (!result.isSuccess) {
      throw result.getError();
    }
    const value = result.getValue();
    expect(value.alreadyCompleted).toBe(false);
    expect(value.batch.status).toBe("completed");
    expect(value.batch.committedAt).toBeTruthy();
    expect(value.summary.imported).toBe(1);
    expect(value.rows[0]!.status).toBe("imported");
    expect(value.rows[0]!.createdBookingId).toBeTruthy();

    const booking = await bookingRepository.findById(
      value.rows[0]!.createdBookingId!,
      tenantA,
    );
    expect(booking).toBeTruthy();
    expect(booking!.status).toBe("confirmed");
  });

  it("2) historical import finalizes as completed", async () => {
    const csv = [
      "external_reference,unit,guest_name,guest_email,check_in,check_out,guests,total,currency",
      `C1-HIST,${unitA},Hist,h@test.com,2024-07-01,2024-07-05,2,400,EUR`,
    ].join("\n");
    const created = await createDraft.execute(
      {
        tenantId: tenantA,
        propertyId: propertyA,
        filename: "hist.csv",
        content: csv,
        dateFormat: "iso",
        now: new Date("2026-10-04T08:00:00.000Z"),
      },
      actor,
    );
    expect(created.isSuccess).toBe(true);
    expect(created.getValue().rows[0]!.temporalClass).toBe("historical");

    const result = await commit.execute(
      created.getValue().batch.id,
      tenantA,
      actor,
      new Date("2026-10-04T09:00:00.000Z"),
    );
    expect(result.isSuccess).toBe(true);
    const booking = await bookingRepository.findById(
      result.getValue().rows[0]!.createdBookingId!,
      tenantA,
    );
    expect(booking!.status).toBe("completed");
  });

  it("3-5) price sources: imported_csv, operator_entered, talos_calculated frozen", async () => {
    const csv = [
      "external_reference,unit,guest_name,guest_email,check_in,check_out,guests,total,currency",
      `C1-CSV,${unitA},C,c@test.com,2026-12-10,2026-12-12,2,111.25,EUR`,
      `C1-OP,${unitA},O,o@test.com,2026-12-20,2026-12-22,2,,`,
      `C1-TALOS,${unitA},T,t@test.com,2027-01-05,2027-01-07,2,,`,
    ].join("\n");
    const created = await createDraft.execute(
      {
        tenantId: tenantA,
        propertyId: propertyA,
        filename: "prices.csv",
        content: csv,
        dateFormat: "iso",
        missingPriceStrategy: "per_row",
        now: new Date("2026-10-04T08:00:00.000Z"),
      },
      actor,
    );
    expect(created.isSuccess).toBe(true);
    const rows = created.getValue().rows;
    const op = rows.find((r) => r.externalReference === "C1-OP")!;
    const talos = rows.find((r) => r.externalReference === "C1-TALOS")!;

    const opDec = await updateDecision.execute(
      {
        batchId: created.getValue().batch.id,
        rowId: op.id,
        tenantId: tenantA,
        priceSource: "operator_entered",
        operatorTotalAmount: "222.50",
        operatorCurrency: "EUR",
        now: new Date("2026-10-04T08:10:00.000Z"),
      },
      actor,
    );
    expect(opDec.isSuccess).toBe(true);

    const talosDec = await updateDecision.execute(
      {
        batchId: created.getValue().batch.id,
        rowId: talos.id,
        tenantId: tenantA,
        priceSource: "talos_calculated",
        now: new Date("2026-10-04T08:11:00.000Z"),
      },
      actor,
    );
    expect(talosDec.isSuccess).toBe(true);
    expect(talosDec.getValue().operatorTotalAmount).toMatch(/^150(\.0+)?$/);

    const result = await commit.execute(
      created.getValue().batch.id,
      tenantA,
      actor,
      new Date("2026-10-04T09:00:00.000Z"),
    );
    expect(result.isSuccess).toBe(true);
    expect(result.getValue().summary.imported).toBe(3);

    for (const row of result.getValue().rows) {
      const quote = await quoteRepository.findById(
        (await bookingRepository.findById(row.createdBookingId!, tenantA))!.quoteId,
        tenantA,
      );
      expect(quote).toBeTruthy();
      if (row.externalReference === "C1-CSV") {
        expect(quote!.snapshot.pricingMode).toBe("imported_csv");
        expect(quote!.snapshot.totalAmount).toMatch(/^111\.2500$/);
      }
      if (row.externalReference === "C1-OP") {
        expect(quote!.snapshot.pricingMode).toBe("operator_entered");
      }
      if (row.externalReference === "C1-TALOS") {
        expect(quote!.snapshot.pricingMode).toBe("talos_calculated");
        expect(quote!.snapshot.totalAmount).toBe("150.0000");
      }
    }
  });

  it("6) keep_existing → skipped_already_imported durable claim", async () => {
    const existingId = "550e8400-e29b-41d4-a716-446655440501";
    await createCompletedBooking({
      tenantId: tenantA,
      propertyId: propertyA,
      unitId: unitA,
      bookingId: existingId,
      checkIn: "2026-11-01",
      checkOut: "2026-11-05",
    });

    const csv = [
      "external_reference,unit,guest_name,guest_email,check_in,check_out,guests,total,currency",
      `C1-KEEP,${unitA},K,k@test.com,2026-11-01,2026-11-05,2,500,EUR`,
    ].join("\n");
    const created = await createDraft.execute(
      {
        tenantId: tenantA,
        propertyId: propertyA,
        filename: "keep.csv",
        content: csv,
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
        conflictResolution: "keep_existing",
        now: new Date("2026-10-04T08:30:00.000Z"),
      },
      actor,
    );
    expect(decided.getValue().status).toBe("skipped");

    const result = await commit.execute(
      created.getValue().batch.id,
      tenantA,
      actor,
      new Date("2026-10-04T09:00:00.000Z"),
    );
    expect(result.isSuccess).toBe(true);
    expect(result.getValue().rows[0]!.status).toBe("skipped_already_imported");
    expect(result.getValue().rows[0]!.createdBookingId).toBeNull();
    expect(result.getValue().summary.skipped).toBe(1);

    const still = await bookingRepository.findById(existingId, tenantA);
    expect(still!.isSuperseded).toBe(false);
  });

  it("7-8) keep_csv single and A/B→X multi-replacement with correct calendar order", async () => {
    const bookingA = "550e8400-e29b-41d4-a716-446655440601";
    const bookingB = "550e8400-e29b-41d4-a716-446655440602";
    await createCompletedBooking({
      tenantId: tenantA,
      propertyId: propertyA,
      unitId: unitA,
      bookingId: bookingA,
      checkIn: "2026-11-10",
      checkOut: "2026-11-12",
    });
    await createCompletedBooking({
      tenantId: tenantA,
      propertyId: propertyA,
      unitId: unitA,
      bookingId: bookingB,
      checkIn: "2026-11-12",
      checkOut: "2026-11-14",
    });

    const csv = [
      "external_reference,unit,guest_name,guest_email,check_in,check_out,guests,total,currency",
      `C1-MULTI,${unitA},X,x@test.com,2026-11-10,2026-11-14,2,900,EUR`,
    ].join("\n");
    const created = await createDraft.execute(
      {
        tenantId: tenantA,
        propertyId: propertyA,
        filename: "multi.csv",
        content: csv,
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
        now: new Date("2026-10-04T08:30:00.000Z"),
      },
      actor,
    );
    expect([...decided.getValue().replaceBookingIds].sort()).toEqual(
      [bookingA, bookingB].sort(),
    );

    const before = await activeBookingBlocks(unitA, tenantA);
    expect(before.map((b) => b.sourceId).sort()).toEqual([bookingA, bookingB].sort());

    const result = await commit.execute(
      created.getValue().batch.id,
      tenantA,
      actor,
      new Date("2026-10-04T09:00:00.000Z"),
    );
    expect(result.isSuccess).toBe(true);
    const createdId = result.getValue().rows[0]!.createdBookingId!;
    expect(result.getValue().summary.supersededBookingIds.sort()).toEqual(
      [bookingA, bookingB].sort(),
    );

    const after = await activeBookingBlocks(unitA, tenantA);
    expect(after.map((b) => b.sourceId)).toEqual([createdId]);

    const oldA = await bookingRepository.findById(bookingA, tenantA);
    const oldB = await bookingRepository.findById(bookingB, tenantA);
    expect(oldA!.isSuperseded).toBe(true);
    expect(oldB!.isSuperseded).toBe(true);
    expect(oldA!.supersededByBookingId).toBe(createdId);
    expect(oldB!.supersededByBookingId).toBe(createdId);
    expect(oldA!.status).toBe("completed");
  });

  it("9) rollback restores A/B occupancy when successor persist fails after release", async () => {
    const bookingA = "550e8400-e29b-41d4-a716-446655440701";
    await createCompletedBooking({
      tenantId: tenantA,
      propertyId: propertyA,
      unitId: unitA,
      bookingId: bookingA,
      checkIn: "2026-11-20",
      checkOut: "2026-11-22",
    });

    const before = await activeBookingBlocks(unitA, tenantA);
    expect(before.some((b) => b.sourceId === bookingA)).toBe(true);

    await expect(
      commerceFlow.runInTenantTransaction(tenantA, async () => {
        await commerceFlow.releaseBookingCalendarOccupancy(tenantA, bookingA);
        const mid = await calendarBlocks.findActiveBlocks(unitA, tenantA);
        expect(mid.some((b) => b.sourceId === bookingA && b.status === "active")).toBe(
          false,
        );
        throw new Error("injected failure after release");
      }),
    ).rejects.toThrow(/injected failure/);

    const after = await activeBookingBlocks(unitA, tenantA);
    expect(after.some((b) => b.sourceId === bookingA)).toBe(true);
  });

  it("10) stale replaceBookingIds fails closed", async () => {
    const bookingA = "550e8400-e29b-41d4-a716-446655440801";
    const bookingB = "550e8400-e29b-41d4-a716-446655440802";
    await createCompletedBooking({
      tenantId: tenantA,
      propertyId: propertyA,
      unitId: unitA,
      bookingId: bookingA,
      checkIn: "2026-11-10",
      checkOut: "2026-11-12",
    });
    await createCompletedBooking({
      tenantId: tenantA,
      propertyId: propertyA,
      unitId: unitA,
      bookingId: bookingB,
      checkIn: "2026-11-12",
      checkOut: "2026-11-14",
    });

    const csv = [
      "external_reference,unit,guest_name,guest_email,check_in,check_out,guests,total,currency",
      `C1-STALE,${unitA},S,s@test.com,2026-11-10,2026-11-14,2,900,EUR`,
    ].join("\n");
    const created = await createDraft.execute(
      {
        tenantId: tenantA,
        propertyId: propertyA,
        filename: "stale.csv",
        content: csv,
        dateFormat: "iso",
        now: new Date("2026-10-04T08:00:00.000Z"),
      },
      actor,
    );
    const row = created.getValue().rows[0]!;
    await updateDecision.execute(
      {
        batchId: created.getValue().batch.id,
        rowId: row.id,
        tenantId: tenantA,
        conflictResolution: "keep_csv",
        now: new Date("2026-10-04T08:30:00.000Z"),
      },
      actor,
    );

    // Corrupt stored replace set so it no longer matches live calendar conflicts.
    await imports.updateRow(row.id, tenantA, {
      replaceBookingIds: [bookingA],
      replaceBookingId: bookingA,
      status: "ready",
      conflictResolution: "keep_csv",
    });

    const result = await commit.execute(
      created.getValue().batch.id,
      tenantA,
      actor,
      new Date("2026-10-04T09:00:00.000Z"),
    );
    expect(result.isFailure).toBe(true);
    expect(result.getError().message).toMatch(/stale|recheck/i);

    const batch = await imports.findBatchById(created.getValue().batch.id, tenantA);
    expect(batch!.status).toBe("draft");
  });

  it("11) confirmed (non-completed) replacement target fails closed", async () => {
    const liveId = "550e8400-e29b-41d4-a716-446655440901";
    await createConfirmedBooking({
      tenantId: tenantA,
      propertyId: propertyA,
      unitId: unitA,
      bookingId: liveId,
      checkIn: "2026-12-01",
      checkOut: "2026-12-05",
    });

    const csv = [
      "external_reference,unit,guest_name,guest_email,check_in,check_out,guests,total,currency",
      `C1-LIVE,${unitA},L,l@test.com,2026-12-01,2026-12-05,2,500,EUR`,
    ].join("\n");
    const created = await createDraft.execute(
      {
        tenantId: tenantA,
        propertyId: propertyA,
        filename: "live.csv",
        content: csv,
        dateFormat: "iso",
        now: new Date("2026-10-04T08:00:00.000Z"),
      },
      actor,
    );
    const row = created.getValue().rows[0]!;
    await updateDecision.execute(
      {
        batchId: created.getValue().batch.id,
        rowId: row.id,
        tenantId: tenantA,
        conflictResolution: "keep_csv",
        now: new Date("2026-10-04T08:30:00.000Z"),
      },
      actor,
    );

    const result = await commit.execute(
      created.getValue().batch.id,
      tenantA,
      actor,
      new Date("2026-10-04T09:00:00.000Z"),
    );
    expect(result.isFailure).toBe(true);
    expect(result.getError().message).toMatch(/not supersedeable|confirmed/i);
  });

  it("12) hard blocker after preflight fails commit", async () => {
    const csv = [
      "external_reference,unit,guest_name,guest_email,check_in,check_out,guests,total,currency",
      `C1-BLOCK,${unitA},B,b@test.com,2026-12-15,2026-12-18,2,100,EUR`,
    ].join("\n");
    const created = await createDraft.execute(
      {
        tenantId: tenantA,
        propertyId: propertyA,
        filename: "block.csv",
        content: csv,
        dateFormat: "iso",
        now: new Date("2026-10-04T08:00:00.000Z"),
      },
      actor,
    );
    expect(created.getValue().rows[0]!.status).toBe("ready");

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
          reason: "late owner",
        },
      });
    });

    const result = await commit.execute(
      created.getValue().batch.id,
      tenantA,
      actor,
      new Date("2026-10-04T09:00:00.000Z"),
    );
    expect(result.isFailure).toBe(true);
    expect(result.getError().message).toMatch(/owner|blocker|recheck/i);
  });

  it("13) CSV peer exclusivity blocks dual keep_csv commit eligibility", async () => {
    const csv = [
      "external_reference,unit,guest_name,guest_email,check_in,check_out,guests,total,currency",
      `PEER-A,${unitA},P1,p1@test.com,2026-12-01,2026-12-05,2,100,EUR`,
      `PEER-B,${unitA},P2,p2@test.com,2026-12-03,2026-12-07,2,100,EUR`,
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
    // Force both to keep_csv via direct row update to simulate invalid state.
    const [r1, r2] = created.getValue().rows;
    await imports.updateRow(r1!.id, tenantA, {
      status: "ready",
      conflictResolution: "keep_csv",
      priceSource: "imported_csv",
    });
    await imports.updateRow(r2!.id, tenantA, {
      status: "ready",
      conflictResolution: "keep_csv",
      priceSource: "imported_csv",
    });

    const result = await commit.execute(
      created.getValue().batch.id,
      tenantA,
      actor,
      new Date("2026-10-04T09:00:00.000Z"),
    );
    expect(result.isFailure).toBe(true);
    expect(result.getError().message).toMatch(/overlapping keep_csv|exclusivity/i);
  });

  it("14) duplicate externalReference among ready rows blocks commit", async () => {
    const csv = [
      "external_reference,unit,guest_name,guest_email,check_in,check_out,guests,total,currency",
      `SAME-REF,${unitA},A,a@test.com,2026-12-01,2026-12-03,2,100,EUR`,
    ].join("\n");
    const created = await createDraft.execute(
      {
        tenantId: tenantA,
        propertyId: propertyA,
        filename: "dup.csv",
        content: csv,
        dateFormat: "iso",
        now: new Date("2026-10-04T08:00:00.000Z"),
      },
      actor,
    );
    const row = created.getValue().rows[0]!;
    // Inject a second ready row with same external reference (bypass create path).
    await imports.createRows([
      {
        id: randomUUID(),
        tenantId: tenantA,
        batchId: created.getValue().batch.id,
        rowNumber: 99,
        externalReference: "SAME-REF",
        unitId: unitA,
        checkIn: "2026-12-10",
        checkOut: "2026-12-12",
        temporalClass: "future",
        guestName: "B",
        guestEmail: "b@test.com",
        guestPhone: null,
        guestCount: 2,
        priceSource: "imported_csv",
        importedTotalAmount: "100.0000",
        importedCurrency: "EUR",
        status: "ready",
      },
    ]);
    // Ensure first row ready
    await imports.updateRow(row.id, tenantA, { status: "ready" });

    const result = await commit.execute(
      created.getValue().batch.id,
      tenantA,
      actor,
      new Date("2026-10-04T09:00:00.000Z"),
    );
    expect(result.isFailure).toBe(true);
    expect(result.getError().message).toMatch(/duplicate externalReference/i);
  });

  it("15-16) double commit is idempotent; second creates nothing", async () => {
    const csv = [
      "external_reference,unit,guest_name,guest_email,check_in,check_out,guests,total,currency",
      `C1-IDEM,${unitA},I,i@test.com,2026-12-01,2026-12-03,2,100,EUR`,
    ].join("\n");
    const created = await createDraft.execute(
      {
        tenantId: tenantA,
        propertyId: propertyA,
        filename: "idem.csv",
        content: csv,
        dateFormat: "iso",
        now: new Date("2026-10-04T08:00:00.000Z"),
      },
      actor,
    );
    const batchId = created.getValue().batch.id;
    const first = await commit.execute(batchId, tenantA, actor, new Date("2026-10-04T09:00:00.000Z"));
    expect(first.isSuccess).toBe(true);
    const createdId = first.getValue().summary.createdBookingIds[0]!;

    const bookingCountBefore = await withTenantTransaction(tenantA, async (tx) =>
      tx.booking.count({ where: { tenantId: tenantA } }),
    );

    const second = await commit.execute(batchId, tenantA, actor, new Date("2026-10-04T09:05:00.000Z"));
    expect(second.isSuccess).toBe(true);
    expect(second.getValue().alreadyCompleted).toBe(true);
    expect(second.getValue().summary.createdBookingIds).toContain(createdId);

    const bookingCountAfter = await withTenantTransaction(tenantA, async (tx) =>
      tx.booking.count({ where: { tenantId: tenantA } }),
    );
    expect(bookingCountAfter).toBe(bookingCountBefore);
  });

  it("17) tenant isolation — cannot commit another tenant batch", async () => {
    const csv = [
      "external_reference,unit,guest_name,guest_email,check_in,check_out,guests,total,currency",
      `C1-TISO,${unitA},T,t@test.com,2026-12-01,2026-12-03,2,100,EUR`,
    ].join("\n");
    const created = await createDraft.execute(
      {
        tenantId: tenantA,
        propertyId: propertyA,
        filename: "tiso.csv",
        content: csv,
        dateFormat: "iso",
        now: new Date("2026-10-04T08:00:00.000Z"),
      },
      actor,
    );
    const actorOther: ActorContext = {
      userId: actorB,
      role: "admin",
      propertyIds: null,
    };
    const result = await commit.execute(
      created.getValue().batch.id,
      tenantB,
      actorOther,
      new Date("2026-10-04T09:00:00.000Z"),
    );
    expect(result.isFailure).toBe(true);
  });

  it("18) outbox/transaction rollback leaves draft unfinished", async () => {
    const csv = [
      "external_reference,unit,guest_name,guest_email,check_in,check_out,guests,total,currency",
      `C1-RB,${unitA},R,r@test.com,2026-12-01,2026-12-03,2,100,EUR`,
    ].join("\n");
    const created = await createDraft.execute(
      {
        tenantId: tenantA,
        propertyId: propertyA,
        filename: "rb.csv",
        content: csv,
        dateFormat: "iso",
        now: new Date("2026-10-04T08:00:00.000Z"),
      },
      actor,
    );
    // Inject failure by making price invalid after draft ready.
    await imports.updateRow(created.getValue().rows[0]!.id, tenantA, {
      priceSource: "imported_csv",
      importedTotalAmount: "0",
      importedCurrency: "EUR",
      status: "ready",
    });

    const result = await commit.execute(
      created.getValue().batch.id,
      tenantA,
      actor,
      new Date("2026-10-04T09:00:00.000Z"),
    );
    expect(result.isFailure).toBe(true);
    const batch = await imports.findBatchById(created.getValue().batch.id, tenantA);
    expect(batch!.status).toBe("draft");
    expect(batch!.committedAt).toBeNull();
  });

  it("19) rejected rows remain non-imported and do not block", async () => {
    const csv = [
      "external_reference,unit,guest_name,guest_email,check_in,check_out,guests,total,currency",
      `C1-OK,${unitA},Ok,ok@test.com,2026-12-01,2026-12-03,2,100,EUR`,
      `,bad-unit,Bad,bad@test.com,2026-12-10,2026-12-12,2,100,EUR`,
    ].join("\n");
    const created = await createDraft.execute(
      {
        tenantId: tenantA,
        propertyId: propertyA,
        filename: "rej.csv",
        content: csv,
        dateFormat: "iso",
        now: new Date("2026-10-04T08:00:00.000Z"),
      },
      actor,
    );
    expect(created.getValue().rejectedRows.length).toBeGreaterThan(0);
    expect(created.getValue().rows.some((r) => r.status === "ready")).toBe(true);

    const result = await commit.execute(
      created.getValue().batch.id,
      tenantA,
      actor,
      new Date("2026-10-04T09:00:00.000Z"),
    );
    expect(result.isSuccess).toBe(true);
    const rejected = await imports.listRejectedRowsForBatch(
      created.getValue().batch.id,
      tenantA,
    );
    expect(rejected.length).toBeGreaterThan(0);
  });

  it("20) completed batch is immutable to recheck/decision", async () => {
    const csv = [
      "external_reference,unit,guest_name,guest_email,check_in,check_out,guests,total,currency",
      `C1-IMM,${unitA},M,m@test.com,2026-12-01,2026-12-03,2,100,EUR`,
    ].join("\n");
    const created = await createDraft.execute(
      {
        tenantId: tenantA,
        propertyId: propertyA,
        filename: "imm.csv",
        content: csv,
        dateFormat: "iso",
        now: new Date("2026-10-04T08:00:00.000Z"),
      },
      actor,
    );
    const batchId = created.getValue().batch.id;
    const committed = await commit.execute(
      batchId,
      tenantA,
      actor,
      new Date("2026-10-04T09:00:00.000Z"),
    );
    expect(committed.isSuccess).toBe(true);

    const decision = await updateDecision.execute(
      {
        batchId,
        rowId: created.getValue().rows[0]!.id,
        tenantId: tenantA,
        priceSource: "operator_entered",
        operatorTotalAmount: "1",
        operatorCurrency: "EUR",
        now: new Date("2026-10-04T10:00:00.000Z"),
      },
      actor,
    );
    expect(decision.isFailure).toBe(true);
  });

  it("negative: successor booking block cannot coexist with unreleased replace target (EXCLUDE)", async () => {
    const bookingA = "550e8400-e29b-41d4-a716-446655440a01";
    await createCompletedBooking({
      tenantId: tenantA,
      propertyId: propertyA,
      unitId: unitA,
      bookingId: bookingA,
      checkIn: "2026-11-10",
      checkOut: "2026-11-14",
    });

    await expect(
      withTenantTransaction(tenantA, async (tx) => {
        const hold = Hold.create({
          id: randomUUID(),
          tenantId: tenantA,
          unitId: unitA,
          propertyId: propertyA,
          checkIn: "2026-11-10",
          checkOut: "2026-11-14",
          guestCount: 2,
        });
        const quote = Quote.createFromFixedTotal({
          id: randomUUID(),
          snapshotId: randomUUID(),
          hold,
          propertyTimezone: "Europe/Athens",
          total: Money.create("100.00", "EUR"),
          pricingMode: "imported_csv",
        });
        // Convert hold before persist (Booking.create does this).
        const booking = Booking.create({
          id: randomUUID(),
          hold,
          quote,
          guest: { name: "X", email: "x@test.com", phone: null },
          confirmationMode: "manual",
        });
        await persistHoldTx(tx, hold);
        await persistQuoteTx(tx, quote);
        await persistBookingTx(tx, booking);
      }),
    ).rejects.toThrow();
  });
});
