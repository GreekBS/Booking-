/**
 * BFS-2 — secure financial reprice preview + confirmation gate (no money mutation).
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { afterAll, beforeEach, expect, it } from "vitest";
import {
  ApplyBookingFinancialRepriceUseCase,
  BFS3_FINANCIAL_APPLY_GATE_MESSAGE,
  BOOKING_FINANCIAL_CONFIRM_TTL_SECONDS,
  BOOKING_FINANCIAL_CONFIRM_TYP,
  ChangeBookingStayUseCase,
  ConfirmBookingUseCase,
  CreateBookingUseCase,
  CreateHoldUseCase,
  CreateQuoteUseCase,
  ForbiddenError,
  OpenPrimaryFolioFromBookingUseCase,
  PermissionChecker,
  PreviewBookingFinancialRepriceUseCase,
  ReservationOrchestrator,
  ResolveOrCreateGuest,
  ValidationError,
  type BookingFinancialConfirmClaims,
  type IBookingFinancialConfirmTokenService,
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
import {
  PrismaPaymentRepository,
  PrismaPaymentSettlementRepository,
} from "../../src/repositories/billing/PaymentRepositories";
import { PrismaFiscalAllocationRepository } from "../../src/repositories/fiscal/FiscalDocumentRepositories";
import { UuidIdGenerator } from "../../src/UuidIdGenerator";
import { truncateIntegrationTables, prisma } from "./helpers";
import { withTenantTransaction } from "../../src/client";
import { seedCommerceFixture } from "./commerceFixtures";
import { runIntegration } from "./integrationGate";

function b64url(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function fromB64url(s: string): Buffer {
  const padded = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  return Buffer.from(padded + pad, "base64");
}

class TestFinancialConfirmTokens implements IBookingFinancialConfirmTokenService {
  constructor(private readonly secret = "it-booking-financial-secret") {}

  issue(
    input: Omit<BookingFinancialConfirmClaims, "typ" | "v" | "iat" | "exp"> & {
      now?: Date;
      ttlSeconds?: number;
    },
  ) {
    const now = input.now ?? new Date();
    const iat = Math.floor(now.getTime() / 1000);
    const claims: BookingFinancialConfirmClaims = {
      typ: BOOKING_FINANCIAL_CONFIRM_TYP,
      v: 1,
      tenantId: input.tenantId,
      propertyId: input.propertyId,
      bookingId: input.bookingId,
      actorId: input.actorId,
      pricingIntent: "recalculate_from_rate_plan",
      currentQuoteId: input.currentQuoteId,
      currentSnapshotId: input.currentSnapshotId,
      currentTotalAmount: input.currentTotalAmount,
      currency: input.currency,
      unitId: input.unitId,
      checkIn: input.checkIn,
      checkOut: input.checkOut,
      guestCount: input.guestCount,
      proposedTotalAmount: input.proposedTotalAmount,
      proposedSubtotalAmount: input.proposedSubtotalAmount,
      proposedFeesAmount: input.proposedFeesAmount,
      proposedTaxesAmount: input.proposedTaxesAmount,
      proposedDiscountAmount: input.proposedDiscountAmount,
      pricingFingerprint: input.pricingFingerprint,
      reasonHash: input.reasonHash,
      iat,
      exp: iat + (input.ttlSeconds ?? BOOKING_FINANCIAL_CONFIRM_TTL_SECONDS),
    };
    const payload = b64url(Buffer.from(JSON.stringify(claims), "utf8"));
    const sig = b64url(
      createHmac("sha256", this.secret).update(payload).digest(),
    );
    return { token: `${payload}.${sig}`, claims };
  }

  verify(token: string, now: Date = new Date()) {
    const parts = token.split(".");
    if (parts.length !== 2) return null;
    const [payload, sig] = parts;
    if (!payload || !sig) return null;
    const expected = b64url(
      createHmac("sha256", this.secret).update(payload).digest(),
    );
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    const claims = JSON.parse(
      fromB64url(payload).toString("utf8"),
    ) as BookingFinancialConfirmClaims;
    if (Math.floor(now.getTime() / 1000) > claims.exp) return null;
    return claims;
  }
}

runIntegration("Booking financial reprice BFS-2", () => {
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
  const confirmTokens = new TestFinancialConfirmTokens();

  const adminActor = {
    userId: "550e8400-e29b-41d4-a716-446655442089",
    role: "admin" as const,
    propertyIds: null,
    isSuperAdmin: false,
  };

  const tenantId = "550e8400-e29b-41d4-a716-446655442080";
  const propertyId = "550e8400-e29b-41d4-a716-446655442081";
  const unitId = "550e8400-e29b-41d4-a716-446655442082";

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
  const previewFinancial = new PreviewBookingFinancialRepriceUseCase(
    bookingRepository,
    quoteRepository,
    reservationOrchestrator,
    permissionChecker,
    confirmTokens,
  );
  const applyFinancial = new ApplyBookingFinancialRepriceUseCase(
    bookingRepository,
    quoteRepository,
    ratePlanRepository,
    commerceFlowRepository,
    reservationOrchestrator,
    permissionChecker,
    confirmTokens,
    {
      folioRepository,
      paymentRepository: new PrismaPaymentRepository(),
      fiscalAllocationRepository: new PrismaFiscalAllocationRepository(),
    },
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
  });

  afterAll(async () => {
    await truncateIntegrationTables();
    await prisma.$disconnect();
  });

  async function createConfirmedBooking(params: {
    checkIn: string;
    checkOut: string;
  }) {
    const holdResult = await createHoldUseCase.execute(
      {
        tenantId,
        unitId,
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
          name: "BFS2 Guest",
          email: "bfs2@test.com",
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

  it("preview recalculates from RatePlan with delta/token; apply gated; preserve still works", async () => {
    const created = await createConfirmedBooking({
      checkIn: "2027-08-01",
      checkOut: "2027-08-04",
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

    await ratePlanRepository.save(tenantId, unitId, {
      baseNightlyAmount: "250.0000",
      currency: "EUR",
      seasons: [],
      dowModifiers: [],
      losDiscounts: [],
    });

    const quotesBefore = await withTenantTransaction(tenantId, async (tx) =>
      tx.quote.count({ where: { tenantId } }),
    );

    const preview = await previewFinancial.execute(
      {
        tenantId,
        bookingId: created.bookingId,
        unitId,
        checkIn: "2027-08-01",
        checkOut: "2027-08-05",
        guestCount: 2,
        reason: "IT rate correction",
      },
      adminActor,
    );
    expect(preview.isSuccess).toBe(true);
    const previewed = preview.getValue();
    expect(previewed.current.totalAmount).toBe(created.originalTotal);
    expect(previewed.proposed?.currency).toBe(created.originalCurrency);
    expect(previewed.proposed?.totalAmount).toBe("1000.0000");
    expect(previewed.priceDelta?.currency).toBe("EUR");
    expect(Number(previewed.priceDelta?.amount)).toBeGreaterThan(0);
    expect(previewed.confirmationToken.length).toBeGreaterThan(16);

    const quotesAfterPreview = await withTenantTransaction(tenantId, async (tx) =>
      tx.quote.count({ where: { tenantId } }),
    );
    expect(quotesAfterPreview).toBe(quotesBefore);

    const bookingAfterPreview = await bookingRepository.findById(
      created.bookingId,
      tenantId,
    );
    expect(bookingAfterPreview!.quoteId).toBe(created.originalQuoteId);
    const quoteAfterPreview = await quoteRepository.findById(
      bookingAfterPreview!.quoteId,
      tenantId,
    );
    expect(quoteAfterPreview!.snapshot.totalAmount).toBe(created.originalTotal);

    const apply = await applyFinancial.execute(
      {
        tenantId,
        bookingId: created.bookingId,
        confirmationToken: previewed.confirmationToken,
        reason: "IT rate correction",
      },
      adminActor,
    );
    expect(apply.isFailure).toBe(true);
    expect(apply.getError()).toBeInstanceOf(ValidationError);
    expect(apply.getError().message).toBe(BFS3_FINANCIAL_APPLY_GATE_MESSAGE);

    const bookingAfterApply = await bookingRepository.findById(
      created.bookingId,
      tenantId,
    );
    expect(bookingAfterApply!.quoteId).toBe(created.originalQuoteId);
    const quoteAfterApply = await quoteRepository.findById(
      bookingAfterApply!.quoteId,
      tenantId,
    );
    expect(quoteAfterApply!.snapshot.totalAmount).toBe(created.originalTotal);

    const folioAfterGate = await folioRepository.findById(tenantId, folioBefore.id);
    expect(folioAfterGate).not.toBeNull();
    expect(folioAfterGate!.lines).toHaveLength(linesBefore);
    expect(folioBefore.balance.folioTotal).toBe(totalBefore);

    const folioLines = await withTenantTransaction(tenantId, async (tx) =>
      tx.folioLine.findMany({ where: { folioId: folioBefore.id } }),
    );
    expect(folioLines).toHaveLength(linesBefore);

    const preserved = await changeBookingStayUseCase.execute(
      {
        tenantId,
        bookingId: created.bookingId,
        unitId,
        checkIn: "2027-08-01",
        checkOut: "2027-08-06",
        guestCount: 2,
      },
      adminActor,
    );
    expect(preserved.isSuccess).toBe(true);
    const preservedQuote = await quoteRepository.findById(
      preserved.getValue().quoteId,
      tenantId,
    );
    expect(preservedQuote!.snapshot.totalAmount).toBe(created.originalTotal);
  });

  it("rejects unauthorized financial preview and direct stay-change recalculate", async () => {
    const created = await createConfirmedBooking({
      checkIn: "2027-09-01",
      checkOut: "2027-09-04",
    });

    const deniedChecker = {
      hasPermission: (
        actor: typeof adminActor,
        permission: string,
        tid: string,
      ) => {
        if (permission === "booking:financial_adjust:tenant") return false;
        return permissionChecker.hasPermission(actor, permission as never, tid);
      },
    };

    const deniedPreview = new PreviewBookingFinancialRepriceUseCase(
      bookingRepository,
      quoteRepository,
      reservationOrchestrator,
      deniedChecker as never,
      confirmTokens,
    );

    const preview = await deniedPreview.execute(
      {
        tenantId,
        bookingId: created.bookingId,
        unitId,
        checkIn: "2027-09-01",
        checkOut: "2027-09-05",
        guestCount: 2,
        reason: "Should be forbidden",
      },
      adminActor,
    );
    expect(preview.isFailure).toBe(true);
    expect(preview.getError()).toBeInstanceOf(ForbiddenError);

    const direct = await changeBookingStayUseCase.execute(
      {
        tenantId,
        bookingId: created.bookingId,
        unitId,
        checkIn: "2027-09-01",
        checkOut: "2027-09-05",
        guestCount: 2,
        pricingIntent: "recalculate_from_rate_plan",
      },
      adminActor,
    );
    expect(direct.isFailure).toBe(true);
    expect(direct.getError().message).toMatch(/BFS-3/);
  });
});
