/**
 * Controlled E2E investigation of Olive-like CSV import failure modes on hcp_test.
 * Synthetic fixtures modeled on Production draft 6d816d7f (schema + conflict shape).
 * Does NOT prove the exact Production CSV will succeed.
 */
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
  GetReservationImportDraftUseCase,
  evaluateReservationImportCommitEligibility,
  resolveFrozenImportCommitPrice,
  PermissionChecker,
  ResolveOrCreateGuest,
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
import { PrismaCommerceFlowRepository } from "../../src/repositories/commerce/CommerceFlowRepository";
import { PrismaGuestRepository } from "../../src/repositories/guests/GuestRepository";
import { PrismaOutboxRepository } from "../../src/repositories/OutboxRepository";
import { TimezoneService } from "../../src/adapters/TimezoneService";
import { truncateIntegrationTables, prisma } from "./helpers";
import { seedCommerceFixture } from "./commerceFixtures";
import { runIntegration } from "./integrationGate";
import { applyIntegrationTestDatabaseEnv } from "../../src/safety/databaseTargetGuard";

runIntegration("Olive CSV import E2E investigation (hcp_test)", () => {
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
  const emptyReplaceDeps = {
    listChannelLinksByBookingId: async () => [],
    listPaymentsByBookingId: async () => [],
    listFoliosByBookingId: async () => [],
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
    bookingRepository,
    emptyReplaceDeps,
  );
  const updateDecision = new UpdateReservationImportRowDecisionUseCase(
    imports,
    createDraft,
    permissionChecker,
    pricing,
  );
  const getDraft = new GetReservationImportDraftUseCase(
    imports,
    permissionChecker,
    bookingRepository,
    emptyReplaceDeps,
    createDraft,
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
    emptyReplaceDeps,
  );

  const tenantId = "550e8400-e29b-41d4-a716-4466554400e1";
  const propertyId = "550e8400-e29b-41d4-a716-4466554400e2";
  const unitId = "550e8400-e29b-41d4-a716-4466554400e3";
  const actorId = "550e8400-e29b-41d4-a716-4466554400e4";
  const actor: ActorContext = {
    userId: actorId,
    role: "admin",
    propertyIds: null,
  };

  beforeEach(async () => {
    expect(applyIntegrationTestDatabaseEnv()).toBe("configured");
    const url = process.env.DATABASE_URL ?? "";
    expect(url).toMatch(/127\.0\.0\.1/);
    expect(url).toMatch(/hcp_test/);
    await truncateIntegrationTables();
    await seedCommerceFixture(
      { tenantId, propertyId, unitId },
      { adminUserId: actorId },
    );
  });

  afterAll(async () => {
    await truncateIntegrationTables();
    await prisma.$disconnect();
  });

  async function createConfirmedBooking(ids: {
    bookingId: string;
    checkIn: string;
    checkOut: string;
  }) {
    const hold = Hold.create({
      id: randomUUID(),
      tenantId,
      unitId,
      propertyId,
      checkIn: ids.checkIn,
      checkOut: ids.checkOut,
      guestCount: 2,
    });
    await holdRepository.save(hold);
    const ratePlan = (await ratePlanRepository.findByUnitId(unitId, tenantId))!;
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
      guest: { name: "Month Block", email: "m@test.com", phone: null },
      confirmationMode: "manual",
    });
    await holdRepository.save(hold);
    await bookingRepository.save(booking);
    booking.confirm(new Date(), mutationOriginOperator());
    await bookingRepository.save(booking);
    return booking;
  }

  it("A) CSV amount without currency → EUR default → commit persists EUR", async () => {
    // Synthetic: amount present, currency omitted (matches Production Guesty NET INCOME mapping).
    const csv = [
      "external_reference,unit,guest_name,guest_email,check_in,check_out,guests,total",
      `SYN-A1,${unitId},Alice Test,a@t.com,2026-12-01,2026-12-05,2,500.00`,
    ].join("\n");

    const created = await createDraft.execute(
      {
        tenantId,
        propertyId,
        filename: "synthetic-no-currency.csv",
        content: csv,
        dateFormat: "iso",
        now: new Date("2026-10-04T08:00:00.000Z"),
      },
      actor,
    );
    expect(created.isSuccess).toBe(true);
    const batch = created.getValue().batch;
    const row = created.getValue().rows[0]!;
    expect(row.priceSource).toBe("imported_csv");
    expect(row.importedTotalAmount).toBeTruthy();
    expect(row.importedCurrency).toBe("EUR");
    expect(row.payload?.currencyDefaulted).toBe(true);
    expect(row.status).toBe("ready");
    const frozen = resolveFrozenImportCommitPrice(row);
    expect(frozen.currency).toBe("EUR");
    expect(frozen.amount).toBeTruthy();

    const elig = evaluateReservationImportCommitEligibility({
      batch,
      rows: created.getValue().rows,
      now: new Date("2026-10-04T09:00:00.000Z"),
    });
    expect(elig.isSuccess).toBe(true);

    const result = await commit.execute(
      batch.id,
      tenantId,
      actor,
      new Date("2026-10-04T09:00:00.000Z"),
    );
    expect(result.isSuccess).toBe(true);
    const bookingId = result.getValue().summary.createdBookingIds[0]!;
    const booking = await bookingRepository.findById(bookingId, tenantId);
    expect(booking).toBeTruthy();
    const quoteRow = await prisma.quote.findUnique({ where: { id: booking!.quoteId } });
    expect(quoteRow?.currency).toBe("EUR");
    const bookingRow = await prisma.booking.findUnique({ where: { id: bookingId } });
    expect(bookingRow?.currency).toBe("EUR");
    expect(bookingRow?.totalAmount.toString()).toMatch(/^500/);
  });

  it("B) three non-overlapping CSV stays keep_csv against one long booking — archive once, import all", async () => {
    const longId = "550e8400-e29b-41d4-a716-4466554400f1";
    // All stays future relative to now so ADVANCE_MIN does not mask the shared-target hole.
    await createConfirmedBooking({
      bookingId: longId,
      checkIn: "2026-11-01",
      checkOut: "2026-11-30",
    });

    const csv = [
      "external_reference,unit,guest_name,guest_email,check_in,check_out,guests,total,currency",
      `SYN-B1,${unitId},A,a@t.com,2026-11-02,2026-11-06,2,100,EUR`,
      `SYN-B2,${unitId},B,b@t.com,2026-11-08,2026-11-12,2,100,EUR`,
      `SYN-B3,${unitId},C,c@t.com,2026-11-18,2026-11-22,2,100,EUR`,
    ].join("\n");

    const created = await createDraft.execute(
      {
        tenantId,
        propertyId,
        filename: "synthetic-shared-target.csv",
        content: csv,
        dateFormat: "iso",
        now: new Date("2026-10-04T08:00:00.000Z"),
      },
      actor,
    );
    expect(created.isSuccess).toBe(true);
    const rows = created.getValue().rows;
    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(row.status).toBe("pending");
      const decided = await updateDecision.execute(
        {
          batchId: created.getValue().batch.id,
          rowId: row.id,
          tenantId,
          conflictResolution: "keep_csv",
          now: new Date("2026-10-04T08:30:00.000Z"),
        },
        actor,
      );
      expect(decided.isSuccess).toBe(true);
      const decidedRow = decided.getValue();
      expect(decidedRow.conflictResolution).toBe("keep_csv");
      expect(decidedRow.replaceBookingIds).toContain(longId);
      // Diagnostic: if not ready, surface preflight blocker (folio/channel/availability).
      if (decidedRow.status !== "ready") {
        // eslint-disable-next-line no-console
        console.log(
          JSON.stringify({
            ref: decidedRow.externalReference,
            status: decidedRow.status,
            errorCode: decidedRow.errorCode,
            errorMessage: decidedRow.errorMessage,
            replaceBookingIds: decidedRow.replaceBookingIds,
          }),
        );
      }
      // Non-overlapping peers → exclusivity allows all three ready.
      expect(decidedRow.status).toBe("ready");
    }

    const draft = await getDraft.execute(
      created.getValue().batch.id,
      tenantId,
      actor,
      new Date("2026-10-04T09:00:00.000Z"),
    );
    if (draft.isFailure) {
      // eslint-disable-next-line no-console
      console.log("getDraft failed:", draft.getError().message);
    }
    expect(draft.isSuccess).toBe(true);
    const elig = evaluateReservationImportCommitEligibility({
      batch: draft.getValue().batch,
      rows: draft.getValue().rows,
      now: new Date("2026-10-04T09:00:00.000Z"),
    });
    expect(elig.isSuccess).toBe(true);

    const result = await commit.execute(
      created.getValue().batch.id,
      tenantId,
      actor,
      new Date("2026-10-04T09:00:00.000Z"),
    );
    expect(result.isSuccess).toBe(true);
    expect(result.getValue().summary.createdBookingIds).toHaveLength(3);
    expect(result.getValue().summary.supersededBookingIds).toEqual([longId]);
    const old = await bookingRepository.findById(longId, tenantId);
    expect(old!.isSuperseded).toBe(true);
    const blocks = await calendarBlocks.findActiveBlocks(unitId, tenantId);
    expect(blocks.some((b) => b.sourceId === longId && b.status === "active")).toBe(
      false,
    );
  });

  it("C) happy path: currency present + single keep_csv target + non-conflict rows commit", async () => {
    const liveId = "550e8400-e29b-41d4-a716-4466554400f2";
    await createConfirmedBooking({
      bookingId: liveId,
      checkIn: "2026-11-10",
      checkOut: "2026-11-14",
    });

    const csv = [
      "external_reference,unit,guest_name,guest_email,check_in,check_out,guests,total,currency",
      `SYN-C1,${unitId},D,d@t.com,2026-11-10,2026-11-14,2,200,EUR`,
      `SYN-C2,${unitId},E,e@t.com,2026-12-01,2026-12-04,2,150,EUR`,
    ].join("\n");

    const created = await createDraft.execute(
      {
        tenantId,
        propertyId,
        filename: "synthetic-happy.csv",
        content: csv,
        dateFormat: "iso",
        now: new Date("2026-10-04T08:00:00.000Z"),
      },
      actor,
    );
    const rows = created.getValue().rows;
    const conflict = rows.find((r) => r.externalReference === "SYN-C1")!;
    const free = rows.find((r) => r.externalReference === "SYN-C2")!;
    expect(free.status).toBe("ready");
    expect(free.importedCurrency).toBe("EUR");

    const decided = await updateDecision.execute(
      {
        batchId: created.getValue().batch.id,
        rowId: conflict.id,
        tenantId,
        conflictResolution: "keep_csv",
        now: new Date("2026-10-04T08:30:00.000Z"),
      },
      actor,
    );
    expect(decided.getValue().status).toBe("ready");

    const result = await commit.execute(
      created.getValue().batch.id,
      tenantId,
      actor,
      new Date("2026-10-04T09:00:00.000Z"),
    );
    expect(result.isSuccess).toBe(true);
    expect(result.getValue().summary.createdBookingIds).toHaveLength(2);
    expect(result.getValue().summary.supersededBookingIds).toEqual([liveId]);
    const old = await bookingRepository.findById(liveId, tenantId);
    expect(old!.isSuperseded).toBe(true);
    const blocks = await calendarBlocks.findActiveBlocks(unitId, tenantId);
    expect(blocks.some((b) => b.sourceId === liveId && b.status === "active")).toBe(
      false,
    );
  });
});
