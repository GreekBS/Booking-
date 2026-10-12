import { randomUUID } from "node:crypto";
import { it, expect, beforeEach, afterAll } from "vitest";
import {
  Booking,
  Hold,
  Quote,
  PricingCalculator,
  PermissionChecker,
  mutationOriginOperator,
  Money,
  Payment,
  Folio,
  buildMonth,
  GetUnitCalendarUseCase,
  type ActorContext,
} from "@hcp/domain";
import { PrismaTenantDashboardOverviewQuery } from "../../src/repositories/commerce/TenantDashboardOverviewQuery";
import { PrismaHoldRepository } from "../../src/repositories/commerce/HoldRepository";
import { PrismaQuoteRepository } from "../../src/repositories/commerce/QuoteRepository";
import { PrismaBookingRepository } from "../../src/repositories/commerce/BookingRepository";
import { PrismaRatePlanRepository } from "../../src/repositories/commerce/RatePlanRepository";
import { PrismaCalendarBlockRepository } from "../../src/repositories/commerce/CalendarBlockRepository";
import { PrismaCommerceFlowRepository } from "../../src/repositories/commerce/CommerceFlowRepository";
import { PrismaCatalogQueryAdapter } from "../../src/adapters/CatalogQueryAdapter";
import { PrismaFolioRepository } from "../../src/repositories/billing/FolioRepository";
import { PrismaPaymentRepository } from "../../src/repositories/billing/PaymentRepositories";
import { PrismaOutboxRepository } from "../../src/repositories/OutboxRepository";
import { withTenantTransaction } from "../../src/client";
import { truncateIntegrationTables, prisma } from "./helpers";
import { seedCommerceFixture } from "./commerceFixtures";
import { runIntegration } from "./integrationGate";
import { applyIntegrationTestDatabaseEnv } from "../../src/safety/databaseTargetGuard";

/**
 * Reporting safety after CSV archive (supersede):
 * - Operational KPIs (occupancy/ADR/projected stay revenue/counts) exclude superseded.
 * - Payments/folios remain on the original superseded booking.
 * - Booking history still loads the superseded row.
 * - Operational calendar occupancy omits superseded stays.
 */
runIntegration("Superseded booking reporting safety", () => {
  const outboxRepository = new PrismaOutboxRepository();
  const holdRepository = new PrismaHoldRepository(outboxRepository);
  const quoteRepository = new PrismaQuoteRepository(outboxRepository);
  const bookingRepository = new PrismaBookingRepository(outboxRepository);
  const ratePlanRepository = new PrismaRatePlanRepository();
  const calendarBlocks = new PrismaCalendarBlockRepository();
  const commerceFlow = new PrismaCommerceFlowRepository(outboxRepository);
  const catalog = new PrismaCatalogQueryAdapter();
  const folioRepository = new PrismaFolioRepository();
  const paymentRepository = new PrismaPaymentRepository();
  const dashboardQuery = new PrismaTenantDashboardOverviewQuery();
  const permissionChecker = new PermissionChecker();

  const tenantId = "550e8400-e29b-41d4-a716-4466554400c1";
  const propertyId = "550e8400-e29b-41d4-a716-4466554400c2";
  const unitId = "550e8400-e29b-41d4-a716-4466554400c3";
  const actorId = "550e8400-e29b-41d4-a716-4466554400c4";
  const actor: ActorContext = {
    userId: actorId,
    role: "admin",
    propertyIds: null,
  };

  beforeEach(async () => {
    const status = applyIntegrationTestDatabaseEnv();
    expect(status).toBe("configured");
    const url = process.env.DATABASE_URL ?? "";
    expect(url).toMatch(/127\.0\.0\.1/);
    expect(url).toMatch(/hcp_test/);
    expect(process.env.ALLOW_TALOS_PRODUCTION_DB_MUTATION).toBeUndefined();

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
    guestName?: string;
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
      guest: {
        name: ids.guestName ?? "Guest",
        email: "guest@test.com",
        phone: null,
      },
      confirmationMode: "manual",
    });
    await holdRepository.save(hold);
    await bookingRepository.save(booking);
    booking.confirm(new Date("2026-10-01T10:00:00.000Z"), mutationOriginOperator());
    await bookingRepository.save(booking);
    return booking;
  }

  it("excludes superseded from occupancy/ADR/projected revenue while preserving financial history", async () => {
    const oldId = "550e8400-e29b-41d4-a716-4466554400d1";
    const newId = "550e8400-e29b-41d4-a716-4466554400d2";
    const checkIn = "2026-11-10";
    const checkOut = "2026-11-14"; // 4 nights

    const oldBooking = await createConfirmedBooking({
      bookingId: oldId,
      checkIn,
      checkOut,
      guestName: "Archived",
    });

    const folioId = "550e8400-e29b-41d4-a716-4466554400d3";
    expect(
      await folioRepository.saveNew(
        Folio.open({
          id: folioId,
          tenantId,
          bookingId: oldId,
          currency: "EUR",
          folioKey: Folio.primaryKey(),
          label: "Primary",
        }),
      ),
    ).toBe("created");

    const paymentId = "550e8400-e29b-41d4-a716-4466554400d4";
    await paymentRepository.saveNew(
      Payment.create({
        id: paymentId,
        tenantId,
        propertyId,
        currency: "EUR",
        amount: Money.create("80.0000", "EUR"),
        status: "SUCCEEDED",
        method: "CASH",
        collectionSource: "PROPERTY",
        bookingId: oldId,
        idempotencyKey: "report-safety-pay",
      }),
    );

    // Match import commit order: release A, persist X, then supersede A→X.
    await commerceFlow.releaseBookingCalendarOccupancy(tenantId, oldId);

    const newBooking = await createConfirmedBooking({
      bookingId: newId,
      checkIn,
      checkOut,
      guestName: "Successor",
    });

    oldBooking.supersedeForImport({
      supersededByBookingId: newId,
      at: new Date("2026-10-04T09:00:00.000Z"),
      reason: "csv_import_replace",
      mutationOrigin: mutationOriginOperator(),
    });
    await bookingRepository.save(oldBooking);

    const reloadedOld = await bookingRepository.findById(oldId, tenantId);
    expect(reloadedOld!.isSuperseded).toBe(true);
    expect(reloadedOld!.status).toBe("confirmed");
    expect(newBooking.isSuperseded).toBe(false);

    const activeBlocks = (await calendarBlocks.findActiveBlocks(unitId, tenantId)).filter(
      (b) => b.blockType === "booking" && b.status === "active",
    );
    expect(activeBlocks.map((b) => b.sourceId).sort()).toEqual([newId]);

    const period = buildMonth(2026, 11);
    const overview = await dashboardQuery.getOverview({
      tenantId,
      allowedPropertyIds: null,
      todayIso: "2026-11-11",
      arrivalsThroughIso: "2026-11-18",
      period,
      recentLimit: 10,
      propertyTimezone: "Europe/Athens",
    });

    // One live stay only — not old+new.
    expect(overview.periodAnalytics.bookingCount).toBe(1);
    expect(overview.periodAnalytics.occupiedNights).toBe(4);
    expect(overview.inHouseToday).toBe(1);
    expect(overview.arrivalsToday).toBe(0);
    expect(overview.todayArrivals.every((b) => b.id !== oldId)).toBe(true);
    expect(overview.recentBookings.some((b) => b.id === oldId)).toBe(false);
    expect(overview.recentBookings.some((b) => b.id === newId)).toBe(true);

    const successorTotal = await withTenantTransaction(tenantId, async (tx) => {
      const row = await tx.booking.findUniqueOrThrow({
        where: { id: newId },
        select: { totalAmount: true },
      });
      return Number(row.totalAmount.toString());
    });
    const supersededTotal = await withTenantTransaction(tenantId, async (tx) => {
      const row = await tx.booking.findUniqueOrThrow({
        where: { id: oldId },
        select: { totalAmount: true },
      });
      return Number(row.totalAmount.toString());
    });
    expect(successorTotal).toBeGreaterThan(0);
    expect(supersededTotal).toBeGreaterThan(0);
    // Projected stay revenue must be successor only — not old+new.
    expect(Number(overview.periodAnalytics.revenue!.total)).toBeCloseTo(
      successorTotal,
      3,
    );
    expect(Number(overview.periodAnalytics.revenue!.total)).not.toBeCloseTo(
      successorTotal + supersededTotal,
      3,
    );
    expect(Number(overview.periodAnalytics.adr!.amount)).toBeCloseTo(
      successorTotal / 4,
      3,
    );

    // Financial records remain on the superseded booking (not transferred/dropped).
    const folios = await folioRepository.findByBooking(tenantId, oldId);
    expect(folios).toHaveLength(1);
    expect(folios[0]!.folio.id).toBe(folioId);
    expect(folios[0]!.folio.bookingId).toBe(oldId);

    const payments = await paymentRepository.listByBooking(tenantId, oldId);
    expect(payments).toHaveLength(1);
    expect(payments[0]!.id).toBe(paymentId);
    expect(payments[0]!.bookingId).toBe(oldId);

    // History search still returns the superseded booking.
    const history = await bookingRepository.search({
      tenantId,
      unitId,
      page: 1,
      limit: 20,
      sortBy: "checkIn",
      sortDir: "asc",
    });
    const historyIds = history.data.map((b) => b.id).sort();
    expect(historyIds).toEqual([oldId, newId].sort());
    expect(history.data.find((b) => b.id === oldId)!.isSuperseded).toBe(true);

    // Operational calendar omits superseded occupancy bars.
    const calendarUc = new GetUnitCalendarUseCase(
      catalog,
      calendarBlocks,
      holdRepository,
      bookingRepository,
      permissionChecker,
    );
    const calendar = await calendarUc.execute(
      {
        tenantId,
        unitId,
        from: "2026-11-01",
        to: "2026-12-01",
      },
      actor,
    );
    expect(calendar.isSuccess).toBe(true);
    const calBookingIds = calendar.getValue().bookings.map((b) => b.id);
    expect(calBookingIds).toEqual([newId]);
  });
});
