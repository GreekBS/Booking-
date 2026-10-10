/**
 * BFS-1 — operator stay-change preserves agreed commercial totals.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, expect, it } from "vitest";
import {
  ChangeBookingStayUseCase,
  ConfirmBookingUseCase,
  CreateBookingUseCase,
  CreateHoldUseCase,
  CreateQuoteUseCase,
  OpenPrimaryFolioFromBookingUseCase,
  PermissionChecker,
  ReservationOrchestrator,
  ResolveOrCreateGuest,
  ValidationError,
} from "@hcp/domain";
import { PrismaHoldRepository } from "../../src/repositories/commerce/HoldRepository";
import { PrismaQuoteRepository } from "../../src/repositories/commerce/QuoteRepository";
import { PrismaBookingRepository } from "../../src/repositories/commerce/BookingRepository";
import { PrismaCalendarBlockRepository } from "../../src/repositories/commerce/CalendarBlockRepository";
import { PrismaRatePlanRepository } from "../../src/repositories/commerce/RatePlanRepository";
import { PrismaAvailabilityRulesRepository } from "../../src/repositories/commerce/AvailabilityRulesRepository";
import { PrismaCommerceFlowRepository } from "../../src/repositories/commerce/CommerceFlowRepository";
import { PrismaGuestRepository } from "../../src/repositories/guests/GuestRepository";
import { PrismaCatalogQueryAdapter } from "../../src/adapters/CatalogQueryAdapter";
import { TimezoneService } from "../../src/adapters/TimezoneService";
import { PrismaOutboxRepository } from "../../src/repositories/OutboxRepository";
import { PrismaAuditLogRepository } from "../../src/repositories/AuditLogRepository";
import { PrismaFolioRepository } from "../../src/repositories/billing/FolioRepository";
import { PrismaPaymentSettlementRepository } from "../../src/repositories/billing/PaymentRepositories";
import { UuidIdGenerator } from "../../src/UuidIdGenerator";
import { truncateIntegrationTables, prisma } from "./helpers";
import { withTenantTransaction } from "../../src/client";
import { seedCommerceFixture, seedAdditionalUnit } from "./commerceFixtures";
import { runIntegration } from "./integrationGate";

runIntegration("Booking stay change BFS-1 preserve totals", () => {
  const outboxRepository = new PrismaOutboxRepository();
  const holdRepository = new PrismaHoldRepository(outboxRepository);
  const quoteRepository = new PrismaQuoteRepository(outboxRepository);
  const bookingRepository = new PrismaBookingRepository(outboxRepository);
  const calendarRepository = new PrismaCalendarBlockRepository();
  const ratePlanRepository = new PrismaRatePlanRepository();
  const availabilityRulesRepository = new PrismaAvailabilityRulesRepository();
  const commerceFlowRepository = new PrismaCommerceFlowRepository(outboxRepository);
  const catalogQueryAdapter = new PrismaCatalogQueryAdapter();
  const timezoneService = new TimezoneService();
  const permissionChecker = new PermissionChecker();
  const auditLogRepository = new PrismaAuditLogRepository();
  const idGenerator = new UuidIdGenerator();
  const folioRepository = new PrismaFolioRepository();
  const paymentSettlementRepository = new PrismaPaymentSettlementRepository();

  const adminActor = {
    userId: "550e8400-e29b-41d4-a716-446655442089",
    role: "admin" as const,
    propertyIds: null,
    isSuperAdmin: false,
  };

  const tenantId = "550e8400-e29b-41d4-a716-446655442080";
  const propertyId = "550e8400-e29b-41d4-a716-446655442081";
  const unitId = "550e8400-e29b-41d4-a716-446655442082";
  const unitId2 = "550e8400-e29b-41d4-a716-446655442083";

  const reservationOrchestrator = new ReservationOrchestrator(
    catalogQueryAdapter,
    calendarRepository,
    availabilityRulesRepository,
    ratePlanRepository,
    timezoneService,
    idGenerator,
  );

  const createHoldUseCase = new CreateHoldUseCase(
    holdRepository,
    reservationOrchestrator,
    permissionChecker,
    idGenerator,
  );
  const createQuoteUseCase = new CreateQuoteUseCase(
    catalogQueryAdapter,
    holdRepository,
    quoteRepository,
    reservationOrchestrator,
    permissionChecker,
    idGenerator,
  );
  const createBookingUseCase = new CreateBookingUseCase(
    holdRepository,
    quoteRepository,
    commerceFlowRepository,
    permissionChecker,
    auditLogRepository,
    idGenerator,
    new ResolveOrCreateGuest(new PrismaGuestRepository(), idGenerator, permissionChecker),
    new PrismaGuestRepository(),
  );
  const confirmBookingUseCase = new ConfirmBookingUseCase(
    bookingRepository,
    permissionChecker,
    auditLogRepository,
  );
  const changeBookingStayUseCase = new ChangeBookingStayUseCase(
    bookingRepository,
    quoteRepository,
    commerceFlowRepository,
    reservationOrchestrator,
    permissionChecker,
    auditLogRepository,
  );
  const openFolioUseCase = new OpenPrimaryFolioFromBookingUseCase(
    bookingRepository,
    quoteRepository,
    folioRepository,
    idGenerator,
    permissionChecker,
    paymentSettlementRepository,
  );

  beforeEach(async () => {
    await truncateIntegrationTables();
    await seedCommerceFixture(
      { tenantId, propertyId, unitId },
      { adminUserId: adminActor.userId },
    );
    await seedAdditionalUnit(tenantId, propertyId, unitId2);
  });

  afterAll(async () => {
    await truncateIntegrationTables();
    await prisma.$disconnect();
  });

  async function createConfirmedBooking(params: {
    unitId?: string;
    checkIn: string;
    checkOut: string;
  }) {
    const holdResult = await createHoldUseCase.execute(
      {
        tenantId,
        unitId: params.unitId ?? unitId,
        checkIn: params.checkIn,
        checkOut: params.checkOut,
        guestCount: 2,
      },
      adminActor,
    );
    expect(holdResult.isSuccess).toBe(true);
    const hold = holdResult.getValue();

    const quoteResult = await createQuoteUseCase.execute(
      { tenantId, holdId: hold.id },
      adminActor,
    );
    expect(quoteResult.isSuccess).toBe(true);
    const quote = quoteResult.getValue();

    const bookingResult = await createBookingUseCase.execute(
      {
        tenantId,
        quoteId: quote.id,
        guest: {
          name: "BFS1 Guest",
          email: "bfs1@test.com",
          phone: null,
        },
        confirmationMode: "manual",
      },
      adminActor,
    );
    expect(bookingResult.isSuccess).toBe(true);
    const booking = bookingResult.getValue();

    const confirmResult = await confirmBookingUseCase.execute(
      { tenantId, bookingId: booking.id },
      adminActor,
    );
    expect(confirmResult.isSuccess).toBe(true);

    return {
      bookingId: booking.id,
      originalQuoteId: quote.id,
      originalTotal: quote.snapshot.totalAmount,
      originalCurrency: quote.snapshot.currency,
    };
  }

  async function replaceQuoteWithFixedTotal(opts: {
    bookingId: string;
    holdId: string;
    unitId: string;
    checkIn: string;
    checkOut: string;
    total: string;
    pricingMode: "imported_csv" | "operator_entered";
  }) {
    const quoteId = randomUUID();
    const snapshotId = randomUUID();
    const snapshot = {
      version: 1,
      checkIn: opts.checkIn,
      checkOut: opts.checkOut,
      propertyTimezone: "Europe/Athens",
      currency: "EUR",
      lineItems: [
        {
          date: opts.checkIn,
          baseAmount: opts.total,
          adjustedAmount: opts.total,
          currency: "EUR",
        },
      ],
      subtotalAmount: opts.total,
      feesAmount: "0.0000",
      taxesAmount: "0.0000",
      totalAmount: opts.total,
      quotedAt: new Date().toISOString(),
      pricingMode: opts.pricingMode,
    };

    await withTenantTransaction(tenantId, async (tx) => {
      await tx.quote.create({
        data: {
          id: quoteId,
          tenantId,
          holdId: opts.holdId,
          unitId: opts.unitId,
          propertyId,
          snapshotId,
          snapshot,
          currency: "EUR",
          totalAmount: opts.total,
          expiresAt: new Date(Date.now() + 86_400_000),
        },
      });
      await tx.booking.update({
        where: { id: opts.bookingId },
        data: {
          quoteId,
          quoteSnapshotId: snapshotId,
          totalAmount: opts.total,
          currency: "EUR",
        },
      });
    });

    return { id: quoteId, snapshotId };
  }

  it("date change preserves booking and quote commercial totals", async () => {
    const created = await createConfirmedBooking({
      checkIn: "2027-06-01",
      checkOut: "2027-06-04",
    });

    // Bump RatePlan so a reprice would differ
    await ratePlanRepository.save(tenantId, unitId, {
      baseNightlyAmount: "999.0000",
      currency: "EUR",
      seasons: [],
      dowModifiers: [],
      losDiscounts: [],
    });

    const result = await changeBookingStayUseCase.execute(
      {
        tenantId,
        bookingId: created.bookingId,
        unitId,
        checkIn: "2027-06-01",
        checkOut: "2027-06-10",
        guestCount: 2,
      },
      adminActor,
    );
    expect(result.isSuccess).toBe(true);

    const bookingRow = await withTenantTransaction(tenantId, async (tx) =>
      tx.booking.findUnique({ where: { id: created.bookingId } }),
    );
    expect(Number(bookingRow!.totalAmount)).toBe(Number(created.originalTotal));

    const originalQuote = await quoteRepository.findById(
      created.originalQuoteId,
      tenantId,
    );
    const newQuote = await quoteRepository.findById(result.getValue().quoteId, tenantId);
    expect(Number(newQuote!.snapshot.totalAmount)).toBe(Number(created.originalTotal));
    expect(newQuote!.snapshot.feesAmount).toBe(originalQuote!.snapshot.feesAmount);
    expect(newQuote!.snapshot.taxesAmount).toBe(originalQuote!.snapshot.taxesAmount);
    expect(newQuote!.snapshot.subtotalAmount).toBe(
      originalQuote!.snapshot.subtotalAmount,
    );
    expect(newQuote!.snapshot.preservedCommercialEvidence?.reason).toBe(
      "stay_geometry_changed",
    );
    expect(newQuote!.snapshot.preservedCommercialEvidence?.lineItems).toEqual(
      originalQuote!.snapshot.lineItems,
    );
    expect(originalQuote).not.toBeNull();

    const audits = await withTenantTransaction(tenantId, async (tx) =>
      tx.auditLog.findMany({
        where: { tenantId, action: "booking.stay_changed", resourceId: created.bookingId },
      }),
    );
    expect(audits.length).toBeGreaterThanOrEqual(1);
    const meta = audits[audits.length - 1]!.metadata as Record<string, unknown>;
    expect(meta.pricingIntent).toBe("preserve_agreed_total");
    expect(Number(meta.previousTotalAmount as string)).toBe(
      Number(created.originalTotal),
    );
    expect(Number(meta.newTotalAmount as string)).toBe(Number(created.originalTotal));
    expect(Number(meta.financialDelta as string)).toBe(0);
  });

  it("guest-count and unit change preserve totals; overlap still enforced", async () => {
    const a = await createConfirmedBooking({
      checkIn: "2027-07-01",
      checkOut: "2027-07-05",
    });
    await createConfirmedBooking({
      unitId: unitId2,
      checkIn: "2027-07-01",
      checkOut: "2027-07-05",
    });

    const guestOnly = await changeBookingStayUseCase.execute(
      {
        tenantId,
        bookingId: a.bookingId,
        unitId,
        checkIn: "2027-07-01",
        checkOut: "2027-07-05",
        guestCount: 4,
      },
      adminActor,
    );
    expect(guestOnly.isSuccess).toBe(true);
    const afterGuest = await withTenantTransaction(tenantId, async (tx) =>
      tx.booking.findUnique({ where: { id: a.bookingId } }),
    );
    expect(Number(afterGuest!.totalAmount)).toBe(Number(a.originalTotal));
    expect(afterGuest!.guestCount).toBe(4);
    const guestQuote = await quoteRepository.findById(
      guestOnly.getValue().quoteId,
      tenantId,
    );
    // Guest-only keeps original nights — no geometry evidence needed.
    expect(guestQuote!.snapshot.preservedCommercialEvidence).toBeNull();
    expect(guestQuote!.snapshot.lineItems.length).toBeGreaterThan(0);

    // Occupied target unit → conflict
    const conflict = await changeBookingStayUseCase.execute(
      {
        tenantId,
        bookingId: a.bookingId,
        unitId: unitId2,
        checkIn: "2027-07-01",
        checkOut: "2027-07-05",
        guestCount: 2,
      },
      adminActor,
    );
    expect(conflict.isFailure).toBe(true);

    // Free move preserves money
    const moved = await changeBookingStayUseCase.execute(
      {
        tenantId,
        bookingId: a.bookingId,
        unitId: unitId2,
        checkIn: "2027-08-01",
        checkOut: "2027-08-04",
        guestCount: 2,
      },
      adminActor,
    );
    expect(moved.isSuccess).toBe(true);
    const afterMove = await withTenantTransaction(tenantId, async (tx) =>
      tx.booking.findUnique({ where: { id: a.bookingId } }),
    );
    expect(Number(afterMove!.totalAmount)).toBe(Number(a.originalTotal));
    expect(afterMove!.unitId).toBe(unitId2);
  });

  it("imported_csv and operator_entered totals remain protected", async () => {
    const created = await createConfirmedBooking({
      checkIn: "2027-09-01",
      checkOut: "2027-09-04",
    });
    const booking = await bookingRepository.findById(created.bookingId, tenantId);
    const fixed = await replaceQuoteWithFixedTotal({
      bookingId: created.bookingId,
      holdId: booking!.holdId,
      unitId,
      checkIn: "2027-09-01",
      checkOut: "2027-09-04",
      total: "777.2500",
      pricingMode: "imported_csv",
    });

    await ratePlanRepository.save(tenantId, unitId, {
      baseNightlyAmount: "50.0000",
      currency: "EUR",
      seasons: [],
      dowModifiers: [],
      losDiscounts: [],
    });

    const result = await changeBookingStayUseCase.execute(
      {
        tenantId,
        bookingId: created.bookingId,
        unitId,
        checkIn: "2027-09-01",
        checkOut: "2027-09-08",
        guestCount: 3,
        pricingIntent: "preserve_agreed_total",
      },
      adminActor,
    );
    expect(result.isSuccess).toBe(true);
    const newQuote = await quoteRepository.findById(result.getValue().quoteId, tenantId);
    expect(newQuote!.snapshot.totalAmount).toBe("777.2500");
    expect(newQuote!.snapshot.pricingMode).toBe("imported_csv");
    expect(await quoteRepository.findById(fixed.id, tenantId)).not.toBeNull();
    expect(fixed.id).toBeTruthy();

    // operator_entered
    const created2 = await createConfirmedBooking({
      checkIn: "2027-10-01",
      checkOut: "2027-10-03",
    });
    const booking2 = await bookingRepository.findById(created2.bookingId, tenantId);
    await replaceQuoteWithFixedTotal({
      bookingId: created2.bookingId,
      holdId: booking2!.holdId,
      unitId,
      checkIn: "2027-10-01",
      checkOut: "2027-10-03",
      total: "120.0000",
      pricingMode: "operator_entered",
    });
    const result2 = await changeBookingStayUseCase.execute(
      {
        tenantId,
        bookingId: created2.bookingId,
        unitId,
        checkIn: "2027-10-02",
        checkOut: "2027-10-06",
        guestCount: 2,
      },
      adminActor,
    );
    expect(result2.isSuccess).toBe(true);
    const q2 = await quoteRepository.findById(result2.getValue().quoteId, tenantId);
    expect(q2!.snapshot.totalAmount).toBe("120.0000");
    expect(q2!.snapshot.pricingMode).toBe("operator_entered");
  });

  it("rejects recalculate and manual intents; folio unchanged on preserve", async () => {
    const created = await createConfirmedBooking({
      checkIn: "2027-05-10",
      checkOut: "2027-05-13",
    });

    const folio = await openFolioUseCase.execute(
      tenantId,
      created.bookingId,
      adminActor,
    );
    expect(folio.isSuccess).toBe(true);
    const folioBefore = folio.getValue();
    const linesBefore = folioBefore.lines.length;
    const totalBefore = folioBefore.balance.folioTotal;

    const recalc = await changeBookingStayUseCase.execute(
      {
        tenantId,
        bookingId: created.bookingId,
        unitId,
        checkIn: "2027-05-10",
        checkOut: "2027-05-16",
        guestCount: 2,
        pricingIntent: "recalculate_from_rate_plan",
      },
      adminActor,
    );
    expect(recalc.isFailure).toBe(true);
    expect(recalc.getError()).toBeInstanceOf(ValidationError);

    const manual = await changeBookingStayUseCase.execute(
      {
        tenantId,
        bookingId: created.bookingId,
        unitId,
        checkIn: "2027-05-10",
        checkOut: "2027-05-16",
        guestCount: 2,
        pricingIntent: "manual_total",
      },
      adminActor,
    );
    expect(manual.isFailure).toBe(true);

    const preserved = await changeBookingStayUseCase.execute(
      {
        tenantId,
        bookingId: created.bookingId,
        unitId,
        checkIn: "2027-05-10",
        checkOut: "2027-05-16",
        guestCount: 2,
      },
      adminActor,
    );
    expect(preserved.isSuccess).toBe(true);

    const folioAfter = await withTenantTransaction(tenantId, async (tx) =>
      tx.folioLine.findMany({ where: { folioId: folioBefore.id } }),
    );
    expect(folioAfter).toHaveLength(linesBefore);

    const folioRow = await folioRepository.findById(tenantId, folioBefore.id);
    expect(folioRow).not.toBeNull();
    expect(folioRow!.lines).toHaveLength(linesBefore);
    expect(folioBefore.balance.folioTotal).toBe(totalBefore);
  });
});
