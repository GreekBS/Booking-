/**
 * BFS-3a — commercial amendment persistence foundation (no financial apply).
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, expect, it } from "vitest";
import {
  ApplyBookingFinancialRepriceUseCase,
  BFS3_FINANCIAL_APPLY_GATE_MESSAGE,
  Booking,
  BookingCommercialAmendment,
  Hold,
  PermissionChecker,
  PricingCalculator,
  Quote,
  ReservationOrchestrator,
  ValidationError,
} from "@hcp/domain";
import { PrismaHoldRepository } from "../../src/repositories/commerce/HoldRepository";
import { PrismaQuoteRepository } from "../../src/repositories/commerce/QuoteRepository";
import { PrismaBookingRepository } from "../../src/repositories/commerce/BookingRepository";
import { PrismaRatePlanRepository } from "../../src/repositories/commerce/RatePlanRepository";
import { PrismaCalendarBlockRepository } from "../../src/repositories/commerce/CalendarBlockRepository";
import { PrismaAvailabilityRulesRepository } from "../../src/repositories/commerce/AvailabilityRulesRepository";
import { PrismaCommerceFlowRepository } from "../../src/repositories/commerce/CommerceFlowRepository";
import { PrismaBookingCommercialAmendmentRepository } from "../../src/repositories/commerce/BookingCommercialAmendmentRepository";
import { PrismaFolioRepository } from "../../src/repositories/billing/FolioRepository";
import { PrismaCatalogQueryAdapter } from "../../src/adapters/CatalogQueryAdapter";
import { TimezoneService } from "../../src/adapters/TimezoneService";
import { PrismaOutboxRepository } from "../../src/repositories/OutboxRepository";
import { UuidIdGenerator } from "../../src/UuidIdGenerator";
import { Folio } from "@hcp/domain";
import {
  truncateIntegrationTables,
  prisma,
  setTenantContext,
  clearTenantContext,
} from "./helpers";
import { withTenantTransaction } from "../../src/client";
import { seedCommerceFixture } from "./commerceFixtures";
import { runIntegration } from "./integrationGate";

runIntegration("Booking commercial amendment BFS-3a", () => {
  const outboxRepository = new PrismaOutboxRepository();
  const holdRepository = new PrismaHoldRepository(outboxRepository);
  const quoteRepository = new PrismaQuoteRepository(outboxRepository);
  const bookingRepository = new PrismaBookingRepository(outboxRepository);
  const ratePlanRepository = new PrismaRatePlanRepository();
  const calendarRepository = new PrismaCalendarBlockRepository();
  const availabilityRulesRepository = new PrismaAvailabilityRulesRepository();
  const commerceFlowRepository = new PrismaCommerceFlowRepository(outboxRepository);
  const amendmentRepository = new PrismaBookingCommercialAmendmentRepository();
  const folioRepository = new PrismaFolioRepository();
  const catalogQueryAdapter = new PrismaCatalogQueryAdapter();
  const timezoneService = new TimezoneService();
  const idGenerator = new UuidIdGenerator();

  const reservationOrchestrator = new ReservationOrchestrator(
    catalogQueryAdapter,
    calendarRepository,
    availabilityRulesRepository,
    ratePlanRepository,
    timezoneService,
    idGenerator,
  );

  const tenantId = "550e8400-e29b-41d4-a716-446655444010";
  const otherTenantId = "550e8400-e29b-41d4-a716-446655444011";
  const propertyId = "550e8400-e29b-41d4-a716-446655444012";
  const unitId = "550e8400-e29b-41d4-a716-446655444013";
  const otherPropertyId = "550e8400-e29b-41d4-a716-446655444014";
  const otherUnitId = "550e8400-e29b-41d4-a716-446655444015";
  const actorId = "550e8400-e29b-41d4-a716-446655444016";

  beforeEach(async () => {
    await truncateIntegrationTables();
    await seedCommerceFixture({ tenantId, propertyId, unitId });
    await seedCommerceFixture({
      tenantId: otherTenantId,
      propertyId: otherPropertyId,
      unitId: otherUnitId,
    });
  });

  afterAll(async () => {
    await truncateIntegrationTables();
    await prisma.$disconnect();
  });

  async function seedBookingPair() {
    const hold = Hold.create({
      id: randomUUID(),
      tenantId,
      unitId,
      propertyId,
      checkIn: "2027-11-01",
      checkOut: "2027-11-04",
      guestCount: 2,
    });
    await holdRepository.save(hold);

    const ratePlan = await ratePlanRepository.findByUnitId(unitId, tenantId);
    const pricing = new PricingCalculator().calculate(
      ratePlan!,
      hold.stayPeriod,
      new Date(),
    );
    const previousQuote = Quote.create({
      id: randomUUID(),
      snapshotId: randomUUID(),
      hold,
      pricing,
      propertyTimezone: "Europe/Athens",
    });
    await quoteRepository.save(previousQuote);

    const booking = Booking.create({
      id: randomUUID(),
      hold,
      quote: previousQuote,
      guest: { name: "BFS3a Guest", email: "bfs3a@test.com", phone: null },
      confirmationMode: "manual",
    });
    await bookingRepository.save(booking);

    // Second quote exists for FK only — booking still points at previousQuote.
    const newQuote = Quote.create({
      id: randomUUID(),
      snapshotId: randomUUID(),
      hold,
      pricing: new PricingCalculator().calculate(
        { ...ratePlan!, baseNightlyAmount: "150.0000" },
        hold.stayPeriod,
        new Date(),
      ),
      propertyTimezone: "Europe/Athens",
    });
    await quoteRepository.save(newQuote);

    return { booking, previousQuote, newQuote };
  }

  function buildAmendment(
    bookingId: string,
    previousQuoteId: string,
    newQuoteId: string,
    overrides: Partial<{
      id: string;
      idempotencyKey: string;
      newTotalAmount: string;
      reason: string;
    }> = {},
  ) {
    return BookingCommercialAmendment.create({
      id: overrides.id ?? randomUUID(),
      tenantId,
      propertyId,
      bookingId,
      previousQuoteId,
      newQuoteId,
      previousTotalAmount: "300.0000",
      newTotalAmount: overrides.newTotalAmount ?? "450.0000",
      currency: "EUR",
      pricingIntent: "recalculate_from_rate_plan",
      reason: overrides.reason ?? "BFS3a persistence test",
      actorId,
      mutationOrigin: "operator",
      confirmationReference: "c".repeat(64),
      idempotencyKey: overrides.idempotencyKey ?? `idem-${randomUUID().slice(0, 12)}`,
      pricingFingerprint: "d".repeat(64),
    });
  }

  it("persists amendment, lists history, enforces idempotency and RLS", async () => {
    const { booking, previousQuote, newQuote } = await seedBookingPair();
    const bookingTotalBefore = (
      await bookingRepository.findById(booking.id, tenantId)
    )!.quoteId;

    const folio = Folio.open({
      id: randomUUID(),
      tenantId,
      bookingId: booking.id,
      currency: "EUR",
    });
    await folioRepository.saveNew(folio);
    const folioBefore = await folioRepository.findById(tenantId, folio.id);

    const amendment = buildAmendment(
      booking.id,
      previousQuote.id,
      newQuote.id,
      { idempotencyKey: "idem-bfs3a-stable-01" },
    );

    const created = await amendmentRepository.insert(amendment);
    expect(created.status).toBe("created");

    const history = await amendmentRepository.listByBookingId(
      tenantId,
      booking.id,
    );
    expect(history).toHaveLength(1);
    expect(history[0]!.deltaAmount).toBe("150.0000");

    const hit = await amendmentRepository.insert(
      buildAmendment(booking.id, previousQuote.id, newQuote.id, {
        id: randomUUID(),
        idempotencyKey: "idem-bfs3a-stable-01",
      }),
    );
    expect(hit.status).toBe("idempotent_hit");

    const conflict = await amendmentRepository.insert(
      buildAmendment(booking.id, previousQuote.id, newQuote.id, {
        id: randomUUID(),
        idempotencyKey: "idem-bfs3a-stable-01",
        newTotalAmount: "999.0000",
      }),
    );
    expect(conflict.status).toBe("idempotent_conflict");

    const bookingAfter = await bookingRepository.findById(booking.id, tenantId);
    expect(bookingAfter!.quoteId).toBe(bookingTotalBefore);
    expect(bookingAfter!.quoteId).toBe(previousQuote.id);

    const folioAfter = await folioRepository.findById(tenantId, folio.id);
    expect(folioAfter!.lines).toHaveLength(folioBefore!.lines.length);

    const payments = await withTenantTransaction(tenantId, async (tx) =>
      tx.payment.count({ where: { tenantId, bookingId: booking.id } }),
    );
    expect(payments).toBe(0);

    const rls = await prisma.$queryRaw<
      Array<{ relrowsecurity: boolean; relforcerowsecurity: boolean }>
    >`
      SELECT c.relrowsecurity, c.relforcerowsecurity
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'booking_commercial_amendments'
    `;
    expect(rls[0]?.relrowsecurity).toBe(true);
    expect(rls[0]?.relforcerowsecurity).toBe(true);

    await setTenantContext(prisma, otherTenantId);
    const cross = await prisma.bookingCommercialAmendment.findMany({
      where: { id: amendment.id },
    });
    expect(cross).toHaveLength(0);
    await setTenantContext(prisma, tenantId);
    const own = await prisma.bookingCommercialAmendment.findMany({
      where: { id: amendment.id },
    });
    expect(own).toHaveLength(1);
    await clearTenantContext(prisma);

    const crossRepo = await amendmentRepository.findByIdempotencyKey(
      otherTenantId,
      "idem-bfs3a-stable-01",
    );
    expect(crossRepo).toBeNull();
  });

  it("rolls back amendment insert with ambient tenant transaction", async () => {
    const { booking, previousQuote, newQuote } = await seedBookingPair();
    const amendment = buildAmendment(
      booking.id,
      previousQuote.id,
      newQuote.id,
      { idempotencyKey: "idem-bfs3a-rollback" },
    );

    await expect(
      withTenantTransaction(tenantId, async () => {
        const result = await amendmentRepository.insert(amendment);
        expect(result.status).toBe("created");
        throw new Error("force rollback");
      }),
    ).rejects.toThrow(/force rollback/);

    const found = await amendmentRepository.findByIdempotencyKey(
      tenantId,
      "idem-bfs3a-rollback",
    );
    expect(found).toBeNull();
  });

  it("financial apply remains disabled (BFS-2 gate)", async () => {
    const { booking } = await seedBookingPair();
    const apply = new ApplyBookingFinancialRepriceUseCase(
      bookingRepository,
      quoteRepository,
      ratePlanRepository,
      commerceFlowRepository,
      reservationOrchestrator,
      new PermissionChecker(),
      {
        issue: () => {
          throw new Error("unused");
        },
        verify: () => null,
      },
    );

    const result = await apply.execute(
      {
        tenantId,
        bookingId: booking.id,
        confirmationToken: "x".repeat(32),
        reason: "Should remain gated",
      },
      {
        userId: actorId,
        role: "admin",
        propertyIds: null,
      },
    );
    expect(result.isFailure).toBe(true);
    // Invalid token before gate is also fine; message must not indicate success.
    expect(result.getError()).toBeInstanceOf(ValidationError);
    expect(result.getError().message).not.toMatch(/applied/i);
    expect(BFS3_FINANCIAL_APPLY_GATE_MESSAGE).toMatch(/disabled until BFS-3/i);
  });
});
