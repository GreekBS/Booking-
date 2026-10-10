/**
 * BFS-4 Phase 1b — post-expiry idempotent replay (disposable hcp_test only).
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { afterAll, beforeEach, expect, it } from "vitest";
import {
  ApplyBookingFinancialRepriceUseCase,
  BOOKING_FINANCIAL_CONFIRM_TTL_SECONDS,
  BOOKING_FINANCIAL_CONFIRM_TYP,
  BookingCommercialAmendment,
  COMMERCIAL_AMENDMENT_IDEMPOTENCY_CONFLICT_MESSAGE,
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
  constructor(private readonly secret = "bfs4-post-expiry-it-secret") {}
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

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

runIntegration("Booking financial reprice BFS-4 post-expiry replay", () => {
  const tenantId = "550e8400-e29b-41d4-a716-446655446001";
  const otherTenantId = "550e8400-e29b-41d4-a716-446655446099";
  const propertyId = "550e8400-e29b-41d4-a716-446655446002";
  const unitId = "550e8400-e29b-41d4-a716-446655446003";
  const adminUserId = "550e8400-e29b-41d4-a716-446655446016";
  const otherAdminUserId = "550e8400-e29b-41d4-a716-446655446017";
  const adminActor = {
    userId: adminUserId,
    role: "admin" as const,
    propertyIds: null,
  };
  const otherActor = {
    userId: otherAdminUserId,
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
        guest: {
          name: "BFS4 Expiry Guest",
          email: "bfs4-expiry@test.com",
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
    };
  }

  async function bumpRatePlan(amount: string) {
    await ratePlanRepository.save(tenantId, unitId, {
      baseNightlyAmount: amount,
      currency: "EUR",
      seasons: [],
      dowModifiers: [],
      losDiscounts: [],
    });
  }

  async function counts(bookingId: string, folioId: string | null) {
    const amendments = await amendmentRepository.listByBookingId(
      tenantId,
      bookingId,
    );
    const quotes = await withTenantTransaction(tenantId, async (tx) =>
      tx.quote.count({ where: { tenantId } }),
    );
    const audits = await withTenantTransaction(tenantId, async (tx) =>
      tx.auditLog.count({
        where: {
          tenantId,
          action: "booking.financial_reprice_applied",
          resourceId: bookingId,
        },
      }),
    );
    const folioLines = folioId
      ? (await folioRepository.findById(tenantId, folioId))!.lines.length
      : 0;
    return {
      amendments: amendments.length,
      quotes,
      audits,
      folioLines,
      amendmentId: amendments[0]?.id ?? null,
    };
  }

  it("expired token with matching completed amendment returns replayed without new writes", async () => {
    const created = await createConfirmedBooking({
      checkIn: "2027-07-01",
      checkOut: "2027-07-04",
    });
    const folio = await openFolioUseCase.execute(
      tenantId,
      created.bookingId,
      adminActor,
    );
    expect(folio.isSuccess).toBe(true);
    const folioId = folio.getValue().id;
    await bumpRatePlan("210.0000");

    // Issue a short-lived confirmation via direct issue after preview path:
    // preview uses confirmTokens.issue with default TTL — override by applying
    // with a token issued at preview-time with ttlSeconds=1.
    // Use the preview use case then re-issue is wrong (different digest).
    // Instead: monkey-patch by calling preview which uses ConfirmToken with
    // default TTL, then we cannot expire quickly.
    // Solution: temporarily wrap confirmTokens.issue — TestTokens accepts ttl
    // only via issue(). PreviewBookingFinancialRepriceUseCase doesn't pass ttl.
    // So issue a short TTL by replacing confirmTokens for this test via
    // applying with a custom Preview that uses ttlSeconds: 1.
    const shortTtlTokens = new TestTokens("bfs4-short-ttl-secret");
    const shortPreview = new PreviewBookingFinancialRepriceUseCase(
      bookingRepository,
      quoteRepository,
      reservationOrchestrator,
      permissionChecker,
      {
        issue: (input) => shortTtlTokens.issue({ ...input, ttlSeconds: 1 }),
        verifySignature: (t) => shortTtlTokens.verifySignature(t),
        verify: (t, now) => shortTtlTokens.verify(t, now),
      },
    );
    const shortApply = new ApplyBookingFinancialRepriceUseCase(
      bookingRepository,
      quoteRepository,
      ratePlanRepository,
      commerceFlowRepository,
      reservationOrchestrator,
      permissionChecker,
      shortTtlTokens,
      {
        folioRepository,
        paymentRepository: new PrismaPaymentRepository(),
        fiscalAllocationRepository: new PrismaFiscalAllocationRepository(),
        amendmentRepository,
        auditLogRepository,
        idGenerator,
      },
    );

    const preview = await shortPreview.execute(
      {
        tenantId,
        bookingId: created.bookingId,
        unitId,
        checkIn: "2027-07-01",
        checkOut: "2027-07-04",
        guestCount: 2,
        reason: "Post-expiry replay",
      },
      adminActor,
    );
    expect(preview.isSuccess).toBe(true);
    const token = preview.getValue().confirmationToken;

    const first = await shortApply.execute(
      {
        tenantId,
        bookingId: created.bookingId,
        confirmationToken: token,
        reason: "Post-expiry replay",
      },
      adminActor,
    );
    expect(first.isSuccess).toBe(true);
    expect(first.getValue().replayed).toBe(false);

    const before = await counts(created.bookingId, folioId);
    expect(before.amendments).toBe(1);

    // Wait until wall-clock passes the inclusive remaining second of `exp`.
    for (let i = 0; i < 30 && shortTtlTokens.verify(token) !== null; i++) {
      await sleep(200);
    }
    expect(shortTtlTokens.verify(token)).toBeNull();
    expect(shortTtlTokens.verifySignature(token)).not.toBeNull();

    const replay = await shortApply.execute(
      {
        tenantId,
        bookingId: created.bookingId,
        confirmationToken: token,
        reason: "Post-expiry replay",
      },
      adminActor,
    );
    expect(replay.isSuccess).toBe(true);
    expect(replay.getValue().replayed).toBe(true);
    expect(replay.getValue().amendmentId).toBe(first.getValue().amendmentId);

    const after = await counts(created.bookingId, folioId);
    expect(after.amendments).toBe(before.amendments);
    expect(after.quotes).toBe(before.quotes);
    expect(after.audits).toBe(before.audits);
    expect(after.folioLines).toBe(before.folioLines);
  });

  it("expired token without completed amendment is rejected", async () => {
    const created = await createConfirmedBooking({
      checkIn: "2027-07-10",
      checkOut: "2027-07-13",
    });
    await bumpRatePlan("220.0000");

    const shortTtlTokens = new TestTokens("bfs4-expired-reject-secret");
    // Issue already past exp so the case is deterministic (no wall-clock race
    // against the inclusive "exp == now second still valid" rule).
    const expiredAtIssue = new Date(Date.now() - 5_000);
    const shortPreview = new PreviewBookingFinancialRepriceUseCase(
      bookingRepository,
      quoteRepository,
      reservationOrchestrator,
      permissionChecker,
      {
        issue: (input) =>
          shortTtlTokens.issue({
            ...input,
            now: expiredAtIssue,
            ttlSeconds: 1,
          }),
        verifySignature: (t) => shortTtlTokens.verifySignature(t),
        verify: (t, now) => shortTtlTokens.verify(t, now),
      },
    );
    const shortApply = new ApplyBookingFinancialRepriceUseCase(
      bookingRepository,
      quoteRepository,
      ratePlanRepository,
      commerceFlowRepository,
      reservationOrchestrator,
      permissionChecker,
      shortTtlTokens,
      {
        folioRepository,
        paymentRepository: new PrismaPaymentRepository(),
        fiscalAllocationRepository: new PrismaFiscalAllocationRepository(),
        amendmentRepository,
        auditLogRepository,
        idGenerator,
      },
    );

    const preview = await shortPreview.execute(
      {
        tenantId,
        bookingId: created.bookingId,
        unitId,
        checkIn: "2027-07-10",
        checkOut: "2027-07-13",
        guestCount: 2,
        reason: "Expired without apply",
      },
      adminActor,
    );
    expect(preview.isSuccess).toBe(true);
    const token = preview.getValue().confirmationToken;
    expect(shortTtlTokens.verify(token)).toBeNull();
    expect(shortTtlTokens.verifySignature(token)).not.toBeNull();

    const rejected = await shortApply.execute(
      {
        tenantId,
        bookingId: created.bookingId,
        confirmationToken: token,
        reason: "Expired without apply",
      },
      adminActor,
    );
    expect(rejected.isFailure).toBe(true);
    expect(rejected.getError().message).toBe(
      "Confirmation token is invalid or expired",
    );
    expect(
      (await amendmentRepository.listByBookingId(tenantId, created.bookingId))
        .length,
    ).toBe(0);
  });

  it("invalid signature is rejected", async () => {
    const created = await createConfirmedBooking({
      checkIn: "2027-07-20",
      checkOut: "2027-07-23",
    });
    await bumpRatePlan("230.0000");
    const preview = await previewFinancial.execute(
      {
        tenantId,
        bookingId: created.bookingId,
        unitId,
        checkIn: "2027-07-20",
        checkOut: "2027-07-23",
        guestCount: 2,
        reason: "Bad signature",
      },
      adminActor,
    );
    expect(preview.isSuccess).toBe(true);
    const token = `${preview.getValue().confirmationToken}x`;
    const rejected = await applyFinancial.execute(
      {
        tenantId,
        bookingId: created.bookingId,
        confirmationToken: token,
        reason: "Bad signature",
      },
      adminActor,
    );
    expect(rejected.isFailure).toBe(true);
    expect(rejected.getError().message).toBe(
      "Confirmation token is invalid or expired",
    );
  });

  it("expired token with wrong actor is rejected", async () => {
    const created = await createConfirmedBooking({
      checkIn: "2027-08-01",
      checkOut: "2027-08-04",
    });
    await bumpRatePlan("240.0000");
    const shortTtlTokens = new TestTokens("bfs4-wrong-actor-secret");
    const shortPreview = new PreviewBookingFinancialRepriceUseCase(
      bookingRepository,
      quoteRepository,
      reservationOrchestrator,
      permissionChecker,
      {
        issue: (input) => shortTtlTokens.issue({ ...input, ttlSeconds: 1 }),
        verifySignature: (t) => shortTtlTokens.verifySignature(t),
        verify: (t, now) => shortTtlTokens.verify(t, now),
      },
    );
    const shortApply = new ApplyBookingFinancialRepriceUseCase(
      bookingRepository,
      quoteRepository,
      ratePlanRepository,
      commerceFlowRepository,
      reservationOrchestrator,
      permissionChecker,
      shortTtlTokens,
      {
        folioRepository,
        paymentRepository: new PrismaPaymentRepository(),
        fiscalAllocationRepository: new PrismaFiscalAllocationRepository(),
        amendmentRepository,
        auditLogRepository,
        idGenerator,
      },
    );

    const preview = await shortPreview.execute(
      {
        tenantId,
        bookingId: created.bookingId,
        unitId,
        checkIn: "2027-08-01",
        checkOut: "2027-08-04",
        guestCount: 2,
        reason: "Wrong actor expiry",
      },
      adminActor,
    );
    expect(preview.isSuccess).toBe(true);
    const token = preview.getValue().confirmationToken;
    const first = await shortApply.execute(
      {
        tenantId,
        bookingId: created.bookingId,
        confirmationToken: token,
        reason: "Wrong actor expiry",
      },
      adminActor,
    );
    expect(first.isSuccess).toBe(true);
    await sleep(1500);

    const rejected = await shortApply.execute(
      {
        tenantId,
        bookingId: created.bookingId,
        confirmationToken: token,
        reason: "Wrong actor expiry",
      },
      otherActor,
    );
    expect(rejected.isFailure).toBe(true);
    expect(rejected.getError().message).toBe(
      "Confirmation token was issued for a different operator",
    );
  });

  it("cross-tenant replay is rejected", async () => {
    const created = await createConfirmedBooking({
      checkIn: "2027-08-10",
      checkOut: "2027-08-13",
    });
    await bumpRatePlan("250.0000");
    const preview = await previewFinancial.execute(
      {
        tenantId,
        bookingId: created.bookingId,
        unitId,
        checkIn: "2027-08-10",
        checkOut: "2027-08-13",
        guestCount: 2,
        reason: "Cross tenant",
      },
      adminActor,
    );
    expect(preview.isSuccess).toBe(true);
    const token = preview.getValue().confirmationToken;
    const first = await applyFinancial.execute(
      {
        tenantId,
        bookingId: created.bookingId,
        confirmationToken: token,
        reason: "Cross tenant",
      },
      adminActor,
    );
    expect(first.isSuccess).toBe(true);

    const rejected = await applyFinancial.execute(
      {
        tenantId: otherTenantId,
        bookingId: created.bookingId,
        confirmationToken: token,
        reason: "Cross tenant",
      },
      adminActor,
    );
    expect(rejected.isFailure).toBe(true);
    expect(rejected.getError().message).toBe(
      "Confirmation token does not match this booking",
    );
  });

  it("expired token with conflicting amendment payload is rejected", async () => {
    const created = await createConfirmedBooking({
      checkIn: "2027-08-20",
      checkOut: "2027-08-23",
    });
    await bumpRatePlan("260.0000");
    const shortTtlTokens = new TestTokens("bfs4-conflict-secret");
    const shortPreview = new PreviewBookingFinancialRepriceUseCase(
      bookingRepository,
      quoteRepository,
      reservationOrchestrator,
      permissionChecker,
      {
        issue: (input) => shortTtlTokens.issue({ ...input, ttlSeconds: 1 }),
        verifySignature: (t) => shortTtlTokens.verifySignature(t),
        verify: (t, now) => shortTtlTokens.verify(t, now),
      },
    );
    const shortApply = new ApplyBookingFinancialRepriceUseCase(
      bookingRepository,
      quoteRepository,
      ratePlanRepository,
      commerceFlowRepository,
      reservationOrchestrator,
      permissionChecker,
      shortTtlTokens,
      {
        folioRepository,
        paymentRepository: new PrismaPaymentRepository(),
        fiscalAllocationRepository: new PrismaFiscalAllocationRepository(),
        amendmentRepository,
        auditLogRepository,
        idGenerator,
      },
    );

    const preview = await shortPreview.execute(
      {
        tenantId,
        bookingId: created.bookingId,
        unitId,
        checkIn: "2027-08-20",
        checkOut: "2027-08-23",
        guestCount: 2,
        reason: "Conflict expiry",
      },
      adminActor,
    );
    expect(preview.isSuccess).toBe(true);
    const token = preview.getValue().confirmationToken;
    const claims = shortTtlTokens.verifySignature(token)!;
    const confirmationReference =
      deriveFinancialRepriceConfirmationReference(token);
    const decoyQuoteId = "bbbbbbbb-cccc-4ddd-8eee-fffffffffff1";

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
          snapshotId: "cccccccc-dddd-4eee-8fff-000000000011",
          snapshot: existing.snapshot as object,
          currency: existing.currency,
          totalAmount: "999.0000",
          expiresAt: existing.expiresAt,
        },
      });
    });

    await amendmentRepository.insert(
      BookingCommercialAmendment.create({
        id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeee1",
        tenantId,
        propertyId,
        bookingId: created.bookingId,
        previousQuoteId: claims.currentQuoteId,
        newQuoteId: decoyQuoteId,
        previousTotalAmount: claims.currentTotalAmount,
        newTotalAmount: "999.0000",
        currency: claims.currency,
        pricingIntent: "recalculate_from_rate_plan",
        reason: "Conflict expiry",
        actorId: adminUserId,
        mutationOrigin: "operator",
        confirmationReference,
        idempotencyKey: confirmationReference,
        pricingFingerprint: claims.pricingFingerprint,
      }),
    );

    await sleep(1500);

    const conflict = await shortApply.execute(
      {
        tenantId,
        bookingId: created.bookingId,
        confirmationToken: token,
        reason: "Conflict expiry",
      },
      adminActor,
    );
    expect(conflict.isFailure).toBe(true);
    expect(conflict.getError().message).toBe(
      COMMERCIAL_AMENDMENT_IDEMPOTENCY_CONFLICT_MESSAGE,
    );
  });

  it("valid non-expired token apply behavior is unchanged", async () => {
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
    await bumpRatePlan("270.0000");

    const preview = await previewFinancial.execute(
      {
        tenantId,
        bookingId: created.bookingId,
        unitId,
        checkIn: "2027-09-01",
        checkOut: "2027-09-04",
        guestCount: 2,
        reason: "Happy path apply",
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
        reason: "Happy path apply",
      },
      adminActor,
    );
    expect(apply.isSuccess).toBe(true);
    expect(apply.getValue().replayed).toBe(false);

    const replay = await applyFinancial.execute(
      {
        tenantId,
        bookingId: created.bookingId,
        confirmationToken: token,
        reason: "Happy path apply",
      },
      adminActor,
    );
    expect(replay.isSuccess).toBe(true);
    expect(replay.getValue().replayed).toBe(true);
    expect(replay.getValue().amendmentId).toBe(apply.getValue().amendmentId);
  });
});
