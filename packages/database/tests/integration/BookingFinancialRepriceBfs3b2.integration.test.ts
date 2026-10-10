/**
 * BFS-3b-2 — atomic financial reprice apply (disposable hcp_test only).
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { afterAll, beforeEach, expect, it } from "vitest";
import {
  ApplyBookingFinancialRepriceUseCase,
  BOOKING_FINANCIAL_CONFIRM_TTL_SECONDS,
  BOOKING_FINANCIAL_CONFIRM_TYP,
  BookingCommercialAmendment,
  COMMERCIAL_AMENDMENT_FOLIO_CLOSED_MESSAGE,
  COMMERCIAL_AMENDMENT_IDEMPOTENCY_CONFLICT_MESSAGE,
  COMMERCIAL_AMENDMENT_ZERO_DELTA_MESSAGE,
  ChangeBookingStayUseCase,
  ConfirmBookingUseCase,
  CreateBookingUseCase,
  CreateHoldUseCase,
  CreateQuoteUseCase,
  OpenPrimaryFolioFromBookingUseCase,
  PermissionChecker,
  PreviewBookingFinancialRepriceUseCase,
  ReservationOrchestrator,
  ResolveOrCreateGuest,
  deriveFinancialRepriceConfirmationReference,
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
import { PrismaBookingCommercialAmendmentRepository } from "../../src/repositories/commerce/BookingCommercialAmendmentRepository";
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

class TestTokens implements IBookingFinancialConfirmTokenService {
  constructor(private readonly secret = "bfs3b2-it-secret") {}
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
      ...input,
      pricingIntent: "recalculate_from_rate_plan",
      iat,
      exp: iat + (input.ttlSeconds ?? BOOKING_FINANCIAL_CONFIRM_TTL_SECONDS),
    };
    const payload = b64url(Buffer.from(JSON.stringify(claims), "utf8"));
    const sig = b64url(
      createHmac("sha256", this.secret).update(payload).digest(),
    );
    return { token: `${payload}.${sig}`, claims };
  }
  verifySignature(token: string) {
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
    try {
      const claims = JSON.parse(
        fromB64url(payload).toString("utf8"),
      ) as BookingFinancialConfirmClaims;
      if (claims.typ !== BOOKING_FINANCIAL_CONFIRM_TYP) return null;
      return claims;
    } catch {
      return null;
    }
  }

  verify(token: string, now: Date = new Date()) {
    const claims = this.verifySignature(token);
    if (!claims) return null;
    if (claims.exp < Math.floor(now.getTime() / 1000)) return null;
    return claims;
  }
}

runIntegration("Booking financial reprice BFS-3b-2", () => {
  const tenantId = "550e8400-e29b-41d4-a716-446655444001";
  const propertyId = "550e8400-e29b-41d4-a716-446655444002";
  const unitId = "550e8400-e29b-41d4-a716-446655444003";
  const adminUserId = "550e8400-e29b-41d4-a716-446655444016";
  const adminActor = {
    userId: adminUserId,
    role: "admin" as const,
    propertyIds: null,
  };

  const outboxRepository = new PrismaOutboxRepository();
  const holdRepository = new PrismaHoldRepository(outboxRepository);
  const quoteRepository = new PrismaQuoteRepository(outboxRepository);
  const bookingRepository = new PrismaBookingRepository(outboxRepository);
  const ratePlanRepository = new PrismaRatePlanRepository();
  const calendarRepository = new PrismaCalendarBlockRepository();
  const availabilityRulesRepository = new PrismaAvailabilityRulesRepository();
  const commerceFlowRepository = new PrismaCommerceFlowRepository(outboxRepository);
  const folioRepository = new PrismaFolioRepository();
  const amendmentRepository = new PrismaBookingCommercialAmendmentRepository();
  const auditLogRepository = new PrismaAuditLogRepository();
  const idGenerator = new UuidIdGenerator();
  const permissionChecker = new PermissionChecker();
  const confirmTokens = new TestTokens();
  const catalogQueryAdapter = new PrismaCatalogQueryAdapter();
  const reservationOrchestrator = new ReservationOrchestrator(
    catalogQueryAdapter,
    calendarRepository,
    availabilityRulesRepository,
    ratePlanRepository,
    new TimezoneService(),
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
      amendmentRepository,
      auditLogRepository,
      idGenerator,
    },
  );
  const openFolioUseCase = new OpenPrimaryFolioFromBookingUseCase(
    bookingRepository,
    quoteRepository,
    folioRepository,
    idGenerator,
    permissionChecker,
    new PrismaPaymentSettlementRepository(),
  );

  beforeEach(async () => {
    await truncateIntegrationTables();
    await seedCommerceFixture({ tenantId, propertyId, unitId }, { adminUserId });
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
        guest: { name: "BFS3b2 Guest", email: "bfs3b2@test.com", phone: null },
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
    };
  }

  it("applies atomically with open folio; replays duplicate token; stay-change recalculate stays gated", async () => {
    const created = await createConfirmedBooking({
      checkIn: "2027-06-01",
      checkOut: "2027-06-04",
    });
    const folio = await openFolioUseCase.execute(
      tenantId,
      created.bookingId,
      adminActor,
    );
    expect(folio.isSuccess).toBe(true);
    const linesBefore = folio.getValue().lines.length;

    await ratePlanRepository.save(tenantId, unitId, {
      baseNightlyAmount: "200.0000",
      currency: "EUR",
      seasons: [],
      dowModifiers: [],
      losDiscounts: [],
    });

    const preview = await previewFinancial.execute(
      {
        tenantId,
        bookingId: created.bookingId,
        unitId,
        checkIn: "2027-06-01",
        checkOut: "2027-06-04",
        guestCount: 2,
        reason: "BFS3b2 atomic apply",
      },
      adminActor,
    );
    expect(preview.isSuccess).toBe(true);
    const token = preview.getValue().confirmationToken;

    const apply = await applyFinancial.execute(
      {
        tenantId,
        bookingId: created.bookingId,
        confirmationToken: token,
        reason: "BFS3b2 atomic apply",
      },
      adminActor,
    );
    expect(apply.isSuccess).toBe(true);
    expect(apply.getValue().replayed).toBe(false);
    expect(apply.getValue().deltaAmount).not.toBe("0.0000");

    const booking = await bookingRepository.findById(created.bookingId, tenantId);
    expect(booking!.quoteId).toBe(apply.getValue().newQuoteId);

    const folioAfter = await folioRepository.findById(tenantId, folio.getValue().id);
    expect(folioAfter!.lines.length).toBe(linesBefore + 1);

    const amendments = await amendmentRepository.listByBookingId(
      tenantId,
      created.bookingId,
    );
    expect(amendments).toHaveLength(1);

    const audits = await withTenantTransaction(tenantId, async (tx) =>
      tx.auditLog.findMany({
        where: {
          tenantId,
          action: "booking.financial_reprice_applied",
          resourceId: created.bookingId,
        },
      }),
    );
    expect(audits).toHaveLength(1);

    const replay = await applyFinancial.execute(
      {
        tenantId,
        bookingId: created.bookingId,
        confirmationToken: token,
        reason: "BFS3b2 atomic apply",
      },
      adminActor,
    );
    expect(replay.isSuccess).toBe(true);
    expect(replay.getValue().replayed).toBe(true);
    expect(replay.getValue().amendmentId).toBe(apply.getValue().amendmentId);
    expect(
      (await amendmentRepository.listByBookingId(tenantId, created.bookingId))
        .length,
    ).toBe(1);
    expect(
      (await folioRepository.findById(tenantId, folio.getValue().id))!.lines
        .length,
    ).toBe(linesBefore + 1);

    const preserved = await changeBookingStayUseCase.execute(
      {
        tenantId,
        bookingId: created.bookingId,
        unitId,
        checkIn: "2027-06-01",
        checkOut: "2027-06-05",
        guestCount: 2,
      },
      adminActor,
    );
    expect(preserved.isSuccess).toBe(true);
    const preservedQuote = await quoteRepository.findById(
      preserved.getValue().quoteId,
      tenantId,
    );
    expect(preservedQuote!.snapshot.totalAmount).toBe(
      apply.getValue().newTotalAmount,
    );
  });

  it("applies without folio when no payments/fiscal; rejects closed folio and zero-delta", async () => {
    const created = await createConfirmedBooking({
      checkIn: "2027-07-01",
      checkOut: "2027-07-04",
    });

    await ratePlanRepository.save(tenantId, unitId, {
      baseNightlyAmount: "180.0000",
      currency: "EUR",
      seasons: [],
      dowModifiers: [],
      losDiscounts: [],
    });

    const preview = await previewFinancial.execute(
      {
        tenantId,
        bookingId: created.bookingId,
        unitId,
        checkIn: "2027-07-01",
        checkOut: "2027-07-04",
        guestCount: 2,
        reason: "No folio apply",
      },
      adminActor,
    );
    expect(preview.isSuccess).toBe(true);
    const apply = await applyFinancial.execute(
      {
        tenantId,
        bookingId: created.bookingId,
        confirmationToken: preview.getValue().confirmationToken,
        reason: "No folio apply",
      },
      adminActor,
    );
    expect(apply.isSuccess).toBe(true);
    const folios = await folioRepository.findByBooking(tenantId, created.bookingId);
    expect(folios).toHaveLength(0);

    // Closed folio rejection
    const created2 = await createConfirmedBooking({
      checkIn: "2027-07-10",
      checkOut: "2027-07-13",
    });
    const opened = await openFolioUseCase.execute(
      tenantId,
      created2.bookingId,
      adminActor,
    );
    expect(opened.isSuccess).toBe(true);
    await withTenantTransaction(tenantId, async (tx) => {
      await tx.folio.update({
        where: { id: opened.getValue().id },
        data: { status: "closed" },
      });
    });
    await ratePlanRepository.save(tenantId, unitId, {
      baseNightlyAmount: "220.0000",
      currency: "EUR",
      seasons: [],
      dowModifiers: [],
      losDiscounts: [],
    });
    const previewClosed = await previewFinancial.execute(
      {
        tenantId,
        bookingId: created2.bookingId,
        unitId,
        checkIn: "2027-07-10",
        checkOut: "2027-07-13",
        guestCount: 2,
        reason: "Closed folio",
      },
      adminActor,
    );
    expect(previewClosed.isSuccess).toBe(true);
    const applyClosed = await applyFinancial.execute(
      {
        tenantId,
        bookingId: created2.bookingId,
        confirmationToken: previewClosed.getValue().confirmationToken,
        reason: "Closed folio",
      },
      adminActor,
    );
    expect(applyClosed.isFailure).toBe(true);
    expect(applyClosed.getError().message).toBe(
      COMMERCIAL_AMENDMENT_FOLIO_CLOSED_MESSAGE,
    );
    const booking2 = await bookingRepository.findById(created2.bookingId, tenantId);
    expect(booking2!.quoteId).toBe(created2.originalQuoteId);

    // Zero-delta: same RatePlan as booking total (100/night * 3 = 300)
    const created3 = await createConfirmedBooking({
      checkIn: "2027-07-20",
      checkOut: "2027-07-23",
    });
    const previewZero = await previewFinancial.execute(
      {
        tenantId,
        bookingId: created3.bookingId,
        unitId,
        checkIn: "2027-07-20",
        checkOut: "2027-07-23",
        guestCount: 2,
        reason: "Zero delta attempt",
      },
      adminActor,
    );
    expect(previewZero.isFailure).toBe(true);
    expect(previewZero.getError().message).toBe(
      COMMERCIAL_AMENDMENT_ZERO_DELTA_MESSAGE,
    );
  });

  it("rolls back when audit append fails mid-transaction", async () => {
    const created = await createConfirmedBooking({
      checkIn: "2027-08-01",
      checkOut: "2027-08-04",
    });
    await ratePlanRepository.save(tenantId, unitId, {
      baseNightlyAmount: "250.0000",
      currency: "EUR",
      seasons: [],
      dowModifiers: [],
      losDiscounts: [],
    });
    const preview = await previewFinancial.execute(
      {
        tenantId,
        bookingId: created.bookingId,
        unitId,
        checkIn: "2027-08-01",
        checkOut: "2027-08-04",
        guestCount: 2,
        reason: "Rollback proof",
      },
      adminActor,
    );
    expect(preview.isSuccess).toBe(true);

    const failingAudit = {
      append: async () => {
        throw new Error("force audit failure");
      },
    };
    const applyFailing = new ApplyBookingFinancialRepriceUseCase(
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
        amendmentRepository,
        auditLogRepository: failingAudit as never,
        idGenerator,
      },
    );

    const result = await applyFailing.execute(
      {
        tenantId,
        bookingId: created.bookingId,
        confirmationToken: preview.getValue().confirmationToken,
        reason: "Rollback proof",
      },
      adminActor,
    );
    expect(result.isFailure).toBe(true);

    const booking = await bookingRepository.findById(created.bookingId, tenantId);
    expect(booking!.quoteId).toBe(created.originalQuoteId);
    expect(
      await amendmentRepository.listByBookingId(tenantId, created.bookingId),
    ).toHaveLength(0);
  });

  it("applies negative commercial delta when rates drop", async () => {
    const created = await createConfirmedBooking({
      checkIn: "2027-09-01",
      checkOut: "2027-09-04",
    });
    const folio = await openFolioUseCase.execute(
      tenantId,
      created.bookingId,
      adminActor,
    );
    expect(folio.isSuccess).toBe(true);
    const totalBefore = folio.getValue().balance.folioTotal;

    await ratePlanRepository.save(tenantId, unitId, {
      baseNightlyAmount: "50.0000",
      currency: "EUR",
      seasons: [],
      dowModifiers: [],
      losDiscounts: [],
    });

    const preview = await previewFinancial.execute(
      {
        tenantId,
        bookingId: created.bookingId,
        unitId,
        checkIn: "2027-09-01",
        checkOut: "2027-09-04",
        guestCount: 2,
        reason: "Negative delta",
      },
      adminActor,
    );
    expect(preview.isSuccess).toBe(true);
    const apply = await applyFinancial.execute(
      {
        tenantId,
        bookingId: created.bookingId,
        confirmationToken: preview.getValue().confirmationToken,
        reason: "Negative delta",
      },
      adminActor,
    );
    expect(apply.isSuccess).toBe(true);
    expect(Number(apply.getValue().deltaAmount)).toBeLessThan(0);
    const folioAfter = await folioRepository.findById(tenantId, folio.getValue().id);
    expect(Number(folioAfter!.folio.computeBalance().folioTotal)).toBeLessThan(
      Number(totalBefore),
    );
  });

  it("rejects conflicting idempotency payload; concurrent applies yield one amendment", async () => {
    const created = await createConfirmedBooking({
      checkIn: "2027-05-01",
      checkOut: "2027-05-04",
    });
    await ratePlanRepository.save(tenantId, unitId, {
      baseNightlyAmount: "210.0000",
      currency: "EUR",
      seasons: [],
      dowModifiers: [],
      losDiscounts: [],
    });
    const preview = await previewFinancial.execute(
      {
        tenantId,
        bookingId: created.bookingId,
        unitId,
        checkIn: "2027-05-01",
        checkOut: "2027-05-04",
        guestCount: 2,
        reason: "Concurrent apply",
      },
      adminActor,
    );
    expect(preview.isSuccess).toBe(true);
    const token = preview.getValue().confirmationToken;

    const [a, b] = await Promise.all([
      applyFinancial.execute(
        {
          tenantId,
          bookingId: created.bookingId,
          confirmationToken: token,
          reason: "Concurrent apply",
        },
        adminActor,
      ),
      applyFinancial.execute(
        {
          tenantId,
          bookingId: created.bookingId,
          confirmationToken: token,
          reason: "Concurrent apply",
        },
        adminActor,
      ),
    ]);
    expect(a.isSuccess && b.isSuccess).toBe(true);
    const ids = new Set([a.getValue().amendmentId, b.getValue().amendmentId]);
    expect(ids.size).toBe(1);
    expect(
      (await amendmentRepository.listByBookingId(tenantId, created.bookingId))
        .length,
    ).toBe(1);
  });

  it("rejects conflicting idempotency payload for same confirmation reference", async () => {
    const created = await createConfirmedBooking({
      checkIn: "2027-05-10",
      checkOut: "2027-05-13",
    });
    await ratePlanRepository.save(tenantId, unitId, {
      baseNightlyAmount: "215.0000",
      currency: "EUR",
      seasons: [],
      dowModifiers: [],
      losDiscounts: [],
    });
    const preview = await previewFinancial.execute(
      {
        tenantId,
        bookingId: created.bookingId,
        unitId,
        checkIn: "2027-05-10",
        checkOut: "2027-05-13",
        guestCount: 2,
        reason: "Idempotency conflict",
      },
      adminActor,
    );
    expect(preview.isSuccess).toBe(true);
    const token = preview.getValue().confirmationToken;
    const confirmationReference =
      deriveFinancialRepriceConfirmationReference(token);
    const claims = confirmTokens.verify(token)!;
    const bookingRow = await bookingRepository.findById(
      created.bookingId,
      tenantId,
    );
    const decoyQuoteId = "bbbbbbbb-cccc-4ddd-8eee-ffffffffffff";
    await withTenantTransaction(tenantId, async (tx) => {
      const existing = await tx.quote.findFirstOrThrow({
        where: { id: claims.currentQuoteId, tenantId },
      });
      await tx.quote.create({
        data: {
          id: decoyQuoteId,
          tenantId,
          holdId: existing.holdId,
          unitId: existing.unitId,
          propertyId: existing.propertyId,
          snapshotId: "cccccccc-dddd-4eee-8fff-000000000001",
          snapshot: existing.snapshot as object,
          currency: existing.currency,
          totalAmount: "999.0000",
          expiresAt: existing.expiresAt,
        },
      });
    });

    // Pre-seed a non-matching amendment under the same idempotency key.
    await amendmentRepository.insert(
      BookingCommercialAmendment.create({
        id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
        tenantId,
        propertyId,
        bookingId: created.bookingId,
        previousQuoteId: claims.currentQuoteId,
        newQuoteId: decoyQuoteId,
        previousTotalAmount: claims.currentTotalAmount,
        newTotalAmount: "999.0000",
        currency: claims.currency,
        pricingIntent: "recalculate_from_rate_plan",
        reason: "Idempotency conflict",
        actorId: adminUserId,
        mutationOrigin: "operator",
        confirmationReference,
        idempotencyKey: confirmationReference,
        pricingFingerprint: claims.pricingFingerprint,
      }),
    );
    expect(bookingRow).not.toBeNull();

    const conflict = await applyFinancial.execute(
      {
        tenantId,
        bookingId: created.bookingId,
        confirmationToken: token,
        reason: "Idempotency conflict",
      },
      adminActor,
    );
    expect(conflict.isFailure).toBe(true);
    expect(conflict.getError().message).toBe(
      COMMERCIAL_AMENDMENT_IDEMPOTENCY_CONFLICT_MESSAGE,
    );
    const booking = await bookingRepository.findById(created.bookingId, tenantId);
    expect(booking!.quoteId).toBe(created.originalQuoteId);
  });

  it("rejects stale RatePlan fingerprint after preview", async () => {
    const created = await createConfirmedBooking({
      checkIn: "2027-04-01",
      checkOut: "2027-04-04",
    });
    await ratePlanRepository.save(tenantId, unitId, {
      baseNightlyAmount: "190.0000",
      currency: "EUR",
      seasons: [],
      dowModifiers: [],
      losDiscounts: [],
    });
    const preview = await previewFinancial.execute(
      {
        tenantId,
        bookingId: created.bookingId,
        unitId,
        checkIn: "2027-04-01",
        checkOut: "2027-04-04",
        guestCount: 2,
        reason: "Stale fingerprint",
      },
      adminActor,
    );
    expect(preview.isSuccess).toBe(true);

    await ratePlanRepository.save(tenantId, unitId, {
      baseNightlyAmount: "195.0000",
      currency: "EUR",
      seasons: [],
      dowModifiers: [],
      losDiscounts: [],
    });

    const apply = await applyFinancial.execute(
      {
        tenantId,
        bookingId: created.bookingId,
        confirmationToken: preview.getValue().confirmationToken,
        reason: "Stale fingerprint",
      },
      adminActor,
    );
    expect(apply.isFailure).toBe(true);
    expect(apply.getError().message).toMatch(/stale|fingerprint|RatePlan/i);
    const booking = await bookingRepository.findById(created.bookingId, tenantId);
    expect(booking!.quoteId).toBe(created.originalQuoteId);
  });

  it("rejects foreign-tenant apply (authorization isolation)", async () => {
    const created = await createConfirmedBooking({
      checkIn: "2027-03-01",
      checkOut: "2027-03-04",
    });
    await ratePlanRepository.save(tenantId, unitId, {
      baseNightlyAmount: "175.0000",
      currency: "EUR",
      seasons: [],
      dowModifiers: [],
      losDiscounts: [],
    });
    const preview = await previewFinancial.execute(
      {
        tenantId,
        bookingId: created.bookingId,
        unitId,
        checkIn: "2027-03-01",
        checkOut: "2027-03-04",
        guestCount: 2,
        reason: "Tenant isolation",
      },
      adminActor,
    );
    expect(preview.isSuccess).toBe(true);

    const foreignTenant = "550e8400-e29b-41d4-a716-446655449999";
    const apply = await applyFinancial.execute(
      {
        tenantId: foreignTenant,
        bookingId: created.bookingId,
        confirmationToken: preview.getValue().confirmationToken,
        reason: "Tenant isolation",
      },
      adminActor,
    );
    expect(apply.isFailure).toBe(true);
    expect(
      await amendmentRepository.listByBookingId(tenantId, created.bookingId),
    ).toHaveLength(0);
  });
});
