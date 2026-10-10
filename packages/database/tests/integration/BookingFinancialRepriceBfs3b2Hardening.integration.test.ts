/**
 * BFS-3b-2 hardening — concurrency, financial guards, mutation audit, replay/security.
 * Disposable local hcp_test only.
 */
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { afterAll, beforeEach, expect, it } from "vitest";
import {
  ApplyBookingFinancialRepriceUseCase,
  BOOKING_FINANCIAL_CONFIRM_TTL_SECONDS,
  BOOKING_FINANCIAL_CONFIRM_TYP,
  COMMERCIAL_AMENDMENT_FISCAL_COVERAGE_MESSAGE,
  COMMERCIAL_AMENDMENT_FOLIO_BASELINE_MESSAGE,
  COMMERCIAL_AMENDMENT_MISSING_FOLIO_ACTIVITY_MESSAGE,
  COMMERCIAL_FEE_TAX_POLICY_A_MESSAGE,
  ConfirmBookingUseCase,
  CreateBookingUseCase,
  CreateHoldUseCase,
  CreateQuoteUseCase,
  FolioLine,
  ForbiddenError,
  IMPORTED_OPERATOR_REPRICE_BLOCK_MESSAGE,
  Money,
  OpenPrimaryFolioFromBookingUseCase,
  PermissionChecker,
  PreviewBookingFinancialRepriceUseCase,
  RecordManualPaymentUseCase,
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
  constructor(private readonly secret = "bfs3b2-harden-secret") {}
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
    try {
      const claims = JSON.parse(
        fromB64url(payload).toString("utf8"),
      ) as BookingFinancialConfirmClaims;
      if (claims.typ !== BOOKING_FINANCIAL_CONFIRM_TYP) return null;
      if (claims.exp < Math.floor(now.getTime() / 1000)) return null;
      return claims;
    } catch {
      return null;
    }
  }
}

runIntegration("Booking financial reprice BFS-3b-2 hardening", () => {
  const tenantId = "550e8400-e29b-41d4-a716-446655445001";
  const propertyId = "550e8400-e29b-41d4-a716-446655445002";
  const unitId = "550e8400-e29b-41d4-a716-446655445003";
  const adminUserId = "550e8400-e29b-41d4-a716-446655445016";
  const otherUserId = "550e8400-e29b-41d4-a716-446655445017";
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
  const paymentRepository = new PrismaPaymentRepository();
  const paymentSettlementRepository = new PrismaPaymentSettlementRepository();
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
      paymentRepository,
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
    paymentSettlementRepository,
  );
  const recordPayment = new RecordManualPaymentUseCase(
    bookingRepository,
    paymentRepository,
    paymentSettlementRepository,
    idGenerator,
    permissionChecker,
  );

  beforeEach(async () => {
    await truncateIntegrationTables();
    await seedCommerceFixture({ tenantId, propertyId, unitId }, { adminUserId });
    await prisma.user.upsert({
      where: { id: otherUserId },
      create: {
        id: otherUserId,
        email: `other-${otherUserId.slice(-8)}@commerce.test`,
        name: "Other Admin",
      },
      update: {},
    });
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
        guest: { name: "Harden Guest", email: "harden@test.com", phone: null },
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
      holdId: hold.id,
      originalQuoteId: quote.id,
      originalTotal: quote.snapshot.totalAmount,
      checkIn: params.checkIn,
      checkOut: params.checkOut,
    };
  }

  async function bumpRate(amount: string) {
    await ratePlanRepository.save(tenantId, unitId, {
      baseNightlyAmount: amount,
      currency: "EUR",
      seasons: [],
      dowModifiers: [],
      losDiscounts: [],
    });
  }

  async function previewToken(opts: {
    bookingId: string;
    checkIn: string;
    checkOut: string;
    reason: string;
  }) {
    return previewFinancial.execute(
      {
        tenantId,
        bookingId: opts.bookingId,
        unitId,
        checkIn: opts.checkIn,
        checkOut: opts.checkOut,
        guestCount: 2,
        reason: opts.reason,
      },
      adminActor,
    );
  }

  async function snapshotState(bookingId: string) {
    const booking = await bookingRepository.findById(bookingId, tenantId);
    const amendments = await amendmentRepository.listByBookingId(
      tenantId,
      bookingId,
    );
    const folios = await folioRepository.findByBooking(tenantId, bookingId);
    const audits = await withTenantTransaction(tenantId, async (tx) =>
      tx.auditLog.findMany({
        where: {
          tenantId,
          action: "booking.financial_reprice_applied",
          resourceId: bookingId,
        },
      }),
    );
    const payments = await paymentRepository.listByBooking(tenantId, bookingId);
    return {
      quoteId: booking!.quoteId,
      checkIn: booking!.stayPeriod.checkIn.value,
      checkOut: booking!.stayPeriod.checkOut.value,
      unitId: booking!.unitId,
      guestCount: booking!.guestCount.value,
      amendmentCount: amendments.length,
      folioLineCounts: folios.map((f) => f.lines.length),
      folioLineIds: folios
        .flatMap((f) => f.lines.map((l) => l.id))
        .sort(),
      auditCount: audits.length,
      paymentCount: payments.length,
      paymentIds: payments.map((p) => p.id).sort(),
      paymentAmounts: payments.map((p) => p.amount).sort(),
    };
  }

  async function assertUnchanged(
    bookingId: string,
    before: Awaited<ReturnType<typeof snapshotState>>,
  ) {
    expect(await snapshotState(bookingId)).toEqual(before);
  }

  it("concurrent payment allocate + financial apply: both orders, no deadlock/loss", async () => {
    const CONCURRENCY_MS = 30_000;

    async function runPair(order: "parallel" | "payment_first" | "apply_first") {
      const created = await createConfirmedBooking({
        checkIn: "2027-06-10",
        checkOut: "2027-06-13",
      });
      const folio = await openFolioUseCase.execute(
        tenantId,
        created.bookingId,
        adminActor,
      );
      expect(folio.isSuccess).toBe(true);
      const folioId = folio.getValue().id;

      await bumpRate("200.0000");
      const preview = await previewToken({
        bookingId: created.bookingId,
        checkIn: created.checkIn,
        checkOut: created.checkOut,
        reason: `Concurrency ${order}`,
      });
      expect(preview.isSuccess).toBe(true);
      const token = preview.getValue().confirmationToken;
      const proposed = preview.getValue().proposedCommercial!.totalAmount;
      const paymentAmount = "100.0000";

      const payFn = () =>
        recordPayment.execute({
          tenantId,
          actor: adminActor,
          auditEntry: {
            tenantId,
            actorId: adminUserId,
            action: "payment.recorded",
            resourceType: "Payment",
            resourceId: null,
            metadata: { bookingId: created.bookingId, order },
            ipAddress: null,
          },
          currency: "EUR",
          amount: paymentAmount,
          method: "CASH",
          collectionSource: "PROPERTY",
          propertyId,
          bookingId: created.bookingId,
          idempotencyKey: `pay-${order}-${randomUUID()}`,
          initialFolioAllocations: [
            { folioId, amount: paymentAmount, reason: "deposit" },
          ],
        });

      const applyFn = () =>
        applyFinancial.execute(
          {
            tenantId,
            bookingId: created.bookingId,
            confirmationToken: token,
            reason: `Concurrency ${order}`,
          },
          adminActor,
        );

      const started = Date.now();
      let payResult;
      let applyResult;
      try {
        if (order === "parallel") {
          [payResult, applyResult] = await Promise.race([
            Promise.all([payFn(), applyFn()]),
            new Promise<never>((_, reject) =>
              setTimeout(
                () =>
                  reject(
                    new Error(
                      `DEADLOCK_OR_TIMEOUT after ${CONCURRENCY_MS}ms order=${order}`,
                    ),
                  ),
                CONCURRENCY_MS,
              ),
            ),
          ]);
        } else if (order === "payment_first") {
          payResult = await payFn();
          applyResult = await applyFn();
        } else {
          applyResult = await applyFn();
          payResult = await payFn();
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        throw new Error(
          `Concurrency failure order=${order} elapsed=${Date.now() - started}ms: ${msg}`,
        );
      }

      if (!payResult.isSuccess) {
        throw new Error(
          `Payment failed order=${order}: ${payResult.getError().message}`,
        );
      }
      if (!applyResult.isSuccess) {
        throw new Error(
          `Apply failed order=${order}: ${applyResult.getError().message}`,
        );
      }
      expect(applyResult.getValue().replayed).toBe(false);

      const booking = await bookingRepository.findById(created.bookingId, tenantId);
      expect(booking!.quoteId).toBe(applyResult.getValue().newQuoteId);
      expect(booking!.stayPeriod.checkIn.value).toBe(created.checkIn);
      expect(booking!.stayPeriod.checkOut.value).toBe(created.checkOut);
      expect(booking!.unitId).toBe(unitId);
      expect(booking!.guestCount.value).toBe(2);

      const amendments = await amendmentRepository.listByBookingId(
        tenantId,
        created.bookingId,
      );
      expect(amendments).toHaveLength(1);

      const folioAfter = await folioRepository.findById(tenantId, folioId);
      const commercialLines = folioAfter!.lines.filter(
        (l) => l.source.sourceType === "booking_commercial_amendment",
      );
      expect(commercialLines).toHaveLength(1);
      expect(commercialLines[0]!.amount).toBe(applyResult.getValue().deltaAmount);

      const payments = await paymentRepository.listByBooking(
        tenantId,
        created.bookingId,
      );
      expect(payments).toHaveLength(1);
      expect(payments[0]!.amount).toBe(paymentAmount);

      const balance = folioAfter!.folio.computeBalance();
      expect(Number(balance.folioTotal)).toBe(Number(proposed));
      const outstanding =
        Number(balance.folioTotal) - Number(paymentAmount);
      expect(outstanding).toBeCloseTo(Number(proposed) - Number(paymentAmount), 4);
    }

    await runPair("payment_first");
    await truncateIntegrationTables();
    await seedCommerceFixture({ tenantId, propertyId, unitId }, { adminUserId });
    await runPair("apply_first");
    await truncateIntegrationTables();
    await seedCommerceFixture({ tenantId, propertyId, unitId }, { adminUserId });
    await runPair("parallel");
  }, 120_000);

  it("financial apply preserves stay geometry, inventory block id, omits stay events", async () => {
    const created = await createConfirmedBooking({
      checkIn: "2027-05-01",
      checkOut: "2027-05-04",
    });
    const blocksBefore = await withTenantTransaction(tenantId, async (tx) =>
      tx.unitCalendarBlock.findMany({
        where: {
          tenantId,
          sourceId: created.bookingId,
          blockType: "booking",
        },
      }),
    );
    expect(blocksBefore).toHaveLength(1);
    const blockId = blocksBefore[0]!.id;

    await bumpRate("180.0000");
    const preview = await previewToken({
      bookingId: created.bookingId,
      checkIn: created.checkIn,
      checkOut: created.checkOut,
      reason: "Geometry preserve",
    });
    expect(preview.isSuccess).toBe(true);
    const apply = await applyFinancial.execute(
      {
        tenantId,
        bookingId: created.bookingId,
        confirmationToken: preview.getValue().confirmationToken,
        reason: "Geometry preserve",
      },
      adminActor,
    );
    expect(apply.isSuccess).toBe(true);

    const booking = await bookingRepository.findById(created.bookingId, tenantId);
    expect(booking!.stayPeriod.checkIn.value).toBe(created.checkIn);
    expect(booking!.stayPeriod.checkOut.value).toBe(created.checkOut);
    expect(booking!.unitId).toBe(unitId);
    expect(booking!.guestCount.value).toBe(2);
    expect(booking!.propertyId).toBe(propertyId);

    const blocksAfter = await withTenantTransaction(tenantId, async (tx) =>
      tx.unitCalendarBlock.findMany({
        where: {
          tenantId,
          sourceId: created.bookingId,
          blockType: "booking",
        },
      }),
    );
    expect(blocksAfter).toHaveLength(1);
    expect(blocksAfter[0]!.id).toBe(blockId);
    expect(blocksAfter[0]!.status).toBe("active");

    const stayEvents = await withTenantTransaction(tenantId, async (tx) =>
      tx.outboxEvent.findMany({
        where: {
          tenantId,
          aggregateId: created.bookingId,
          eventType: {
            in: [
              "BookingStayChanged",
              "BookingUnitChanged",
              "BookingGuestCountChanged",
            ],
          },
        },
      }),
    );
    expect(stayEvents).toHaveLength(0);
  });

  it("rejects fiscal coverage and baseline mismatch with unchanged state", async () => {
    const created = await createConfirmedBooking({
      checkIn: "2027-04-01",
      checkOut: "2027-04-04",
    });
    const folio = await openFolioUseCase.execute(
      tenantId,
      created.bookingId,
      adminActor,
    );
    expect(folio.isSuccess).toBe(true);
    const accLine = folio
      .getValue()
      .lines.find((l) => l.lineType === "accommodation")!;
    const docId = randomUUID();
    const docLineId = randomUUID();
    await withTenantTransaction(tenantId, async (tx) => {
      await tx.fiscalDocument.create({
        data: {
          id: docId,
          tenantId,
          propertyId,
          documentKind: "invoice",
          status: "issued",
          currency: "EUR",
          issuerSnapshot: {},
          netTotal: "50.0000",
          vatTotal: "0.0000",
          otherTaxTotal: "0.0000",
          levyTotal: "0.0000",
          grossTotal: "50.0000",
          sourceBookingId: created.bookingId,
          issuedAt: new Date(),
        },
      });
      await tx.fiscalDocumentLine.create({
        data: {
          id: docLineId,
          tenantId,
          fiscalDocumentId: docId,
          sortOrder: 0,
          description: "Stay",
          quantity: "1.0000",
          netAmount: "50.0000",
          vatAmount: "0.0000",
          levyAmount: "0.0000",
          grossAmount: "50.0000",
          currency: "EUR",
          sourceFolioId: folio.getValue().id,
          sourceFolioLineId: accLine.id,
        },
      });
      await tx.fiscalLineAllocation.create({
        data: {
          id: randomUUID(),
          tenantId,
          folioId: folio.getValue().id,
          folioLineId: accLine.id,
          fiscalDocumentId: docId,
          fiscalDocumentLineId: docLineId,
          allocatedAmount: "50.0000",
          currency: "EUR",
        },
      });
    });
    await bumpRate("200.0000");
    const preview = await previewToken({
      bookingId: created.bookingId,
      checkIn: created.checkIn,
      checkOut: created.checkOut,
      reason: "Fiscal coverage",
    });
    expect(preview.isSuccess).toBe(true);
    const before = await snapshotState(created.bookingId);
    const apply = await applyFinancial.execute(
      {
        tenantId,
        bookingId: created.bookingId,
        confirmationToken: preview.getValue().confirmationToken,
        reason: "Fiscal coverage",
      },
      adminActor,
    );
    expect(apply.isFailure).toBe(true);
    expect(apply.getError().message).toBe(
      COMMERCIAL_AMENDMENT_FISCAL_COVERAGE_MESSAGE,
    );
    await assertUnchanged(created.bookingId, before);

    // Baseline mismatch on a fresh booking
    const created2 = await createConfirmedBooking({
      checkIn: "2027-04-10",
      checkOut: "2027-04-13",
    });
    const folio2 = await openFolioUseCase.execute(
      tenantId,
      created2.bookingId,
      adminActor,
    );
    expect(folio2.isSuccess).toBe(true);
    const acc2 = folio2
      .getValue()
      .lines.find((l) => l.lineType === "accommodation")!;
    await withTenantTransaction(tenantId, async (tx) => {
      await tx.folioLine.update({
        where: { id: acc2.id },
        data: { amount: "50.0000" },
      });
    });
    await bumpRate("190.0000");
    const preview2 = await previewToken({
      bookingId: created2.bookingId,
      checkIn: created2.checkIn,
      checkOut: created2.checkOut,
      reason: "Baseline mismatch",
    });
    expect(preview2.isSuccess).toBe(true);
    const before2 = await snapshotState(created2.bookingId);
    const apply2 = await applyFinancial.execute(
      {
        tenantId,
        bookingId: created2.bookingId,
        confirmationToken: preview2.getValue().confirmationToken,
        reason: "Baseline mismatch",
      },
      adminActor,
    );
    expect(apply2.isFailure).toBe(true);
    expect(apply2.getError().message).toBe(
      COMMERCIAL_AMENDMENT_FOLIO_BASELINE_MESSAGE,
    );
    await assertUnchanged(created2.bookingId, before2);
  });

  it("rejects Policy A and imported/operator-entered pricing modes", async () => {
    const created = await createConfirmedBooking({
      checkIn: "2027-04-20",
      checkOut: "2027-04-23",
    });
    await withTenantTransaction(tenantId, async (tx) => {
      const q = await tx.quote.findFirstOrThrow({
        where: { id: created.originalQuoteId, tenantId },
      });
      const snap = q.snapshot as Record<string, unknown>;
      await tx.quote.update({
        where: { id: q.id },
        data: {
          snapshot: { ...snap, feesAmount: "25.0000", taxesAmount: "0.0000" },
        },
      });
    });
    await bumpRate("210.0000");
    const preview = await previewToken({
      bookingId: created.bookingId,
      checkIn: created.checkIn,
      checkOut: created.checkOut,
      reason: "Policy A",
    });
    expect(preview.isFailure).toBe(true);
    expect(preview.getError().message).toBe(COMMERCIAL_FEE_TAX_POLICY_A_MESSAGE);

    for (const pricingMode of ["imported_csv", "operator_entered"] as const) {
      const row = await createConfirmedBooking({
        checkIn: pricingMode === "imported_csv" ? "2027-03-01" : "2027-03-10",
        checkOut: pricingMode === "imported_csv" ? "2027-03-04" : "2027-03-13",
      });
      const booking = await bookingRepository.findById(row.bookingId, tenantId);
      const quoteId = randomUUID();
      const snapshotId = randomUUID();
      await withTenantTransaction(tenantId, async (tx) => {
        await tx.quote.create({
          data: {
            id: quoteId,
            tenantId,
            holdId: booking!.holdId,
            unitId,
            propertyId,
            snapshotId,
            snapshot: {
              version: 1,
              checkIn: row.checkIn,
              checkOut: row.checkOut,
              propertyTimezone: "Europe/Athens",
              currency: "EUR",
              lineItems: [
                {
                  date: row.checkIn,
                  baseAmount: "300.0000",
                  adjustedAmount: "300.0000",
                  currency: "EUR",
                },
              ],
              subtotalAmount: "300.0000",
              feesAmount: "0.0000",
              taxesAmount: "0.0000",
              totalAmount: "300.0000",
              quotedAt: new Date().toISOString(),
              pricingMode,
            },
            currency: "EUR",
            totalAmount: "300.0000",
            expiresAt: new Date(Date.now() + 86_400_000),
          },
        });
        await tx.booking.update({
          where: { id: row.bookingId },
          data: {
            quoteId,
            quoteSnapshotId: snapshotId,
            totalAmount: "300.0000",
          },
        });
      });
      await bumpRate("250.0000");
      const p = await previewToken({
        bookingId: row.bookingId,
        checkIn: row.checkIn,
        checkOut: row.checkOut,
        reason: `Mode ${pricingMode}`,
      });
      expect(p.isFailure).toBe(true);
      expect(p.getError().message).toBe(IMPORTED_OPERATOR_REPRICE_BLOCK_MESSAGE);
    }
  });

  it("preserves extras/tax_evaluation lines and payments; negative delta may overpay", async () => {
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

    const extra = FolioLine.createPosted({
      id: randomUUID(),
      tenantId,
      folioId,
      lineType: "extra",
      description: "Parking",
      amount: Money.create("40.0000", "EUR"),
      source: {
        sourceType: "manual",
        sourceId: created.bookingId,
        sourceLineRef: "extra_parking",
      },
      sortOrder: 10,
    });
    const taxEval = FolioLine.createPosted({
      id: randomUUID(),
      tenantId,
      folioId,
      lineType: "tax",
      description: "Climate tax",
      amount: Money.create("12.0000", "EUR"),
      source: {
        sourceType: "tax_evaluation",
        sourceId: "tax-rule-1",
        sourceLineRef: "climate",
      },
      sortOrder: 11,
    });
    const append = await folioRepository.appendLines(tenantId, folioId, [
      extra,
      taxEval,
    ]);
    expect(append).toBe("appended");

    const pay = await recordPayment.execute({
      tenantId,
      actor: adminActor,
      auditEntry: {
        tenantId,
        actorId: adminUserId,
        action: "payment.recorded",
        resourceType: "Payment",
        resourceId: null,
        metadata: { bookingId: created.bookingId },
        ipAddress: null,
      },
      currency: "EUR",
      amount: created.originalTotal,
      method: "CASH",
      collectionSource: "PROPERTY",
      propertyId,
      bookingId: created.bookingId,
      idempotencyKey: `full-pay-${randomUUID()}`,
      initialFolioAllocations: [
        { folioId, amount: created.originalTotal, reason: "full" },
      ],
    });
    expect(pay.isSuccess).toBe(true);
    const paymentId = pay.getValue().id;

    await bumpRate("50.0000");
    const preview = await previewToken({
      bookingId: created.bookingId,
      checkIn: created.checkIn,
      checkOut: created.checkOut,
      reason: "Negative overpay",
    });
    expect(preview.isSuccess).toBe(true);
    const apply = await applyFinancial.execute(
      {
        tenantId,
        bookingId: created.bookingId,
        confirmationToken: preview.getValue().confirmationToken,
        reason: "Negative overpay",
      },
      adminActor,
    );
    expect(apply.isSuccess).toBe(true);
    expect(Number(apply.getValue().deltaAmount)).toBeLessThan(0);

    const folioAfter = await folioRepository.findById(tenantId, folioId);
    expect(folioAfter!.lines.some((l) => l.id === extra.id)).toBe(true);
    expect(folioAfter!.lines.some((l) => l.id === taxEval.id)).toBe(true);
    expect(
      folioAfter!.lines.filter(
        (l) => l.source.sourceType === "booking_commercial_amendment",
      ),
    ).toHaveLength(1);

    const paymentAfter = await paymentRepository.findById(tenantId, paymentId);
    expect(paymentAfter!.amount).toBe(created.originalTotal);
    expect(paymentAfter!.status).toBe("SUCCEEDED");

    const balance = folioAfter!.folio.computeBalance();
    const outstanding =
      Number(balance.folioTotal) - Number(created.originalTotal);
    expect(outstanding).toBeLessThan(0);
  });

  it("rejects missing primary folio with payment activity; invalid actor; expired token; wrong replay actor", async () => {
    // Missing folio + payment
    const created = await createConfirmedBooking({
      checkIn: "2027-08-01",
      checkOut: "2027-08-04",
    });
    const pay = await recordPayment.execute({
      tenantId,
      actor: adminActor,
      auditEntry: {
        tenantId,
        actorId: adminUserId,
        action: "payment.recorded",
        resourceType: "Payment",
        resourceId: null,
        metadata: { bookingId: created.bookingId },
        ipAddress: null,
      },
      currency: "EUR",
      amount: "50.0000",
      method: "CASH",
      collectionSource: "PROPERTY",
      propertyId,
      bookingId: created.bookingId,
      idempotencyKey: `orphan-pay-${randomUUID()}`,
    });
    expect(pay.isSuccess).toBe(true);
    await bumpRate("175.0000");
    const preview = await previewToken({
      bookingId: created.bookingId,
      checkIn: created.checkIn,
      checkOut: created.checkOut,
      reason: "Missing folio activity",
    });
    expect(preview.isSuccess).toBe(true);
    const before = await snapshotState(created.bookingId);
    const apply = await applyFinancial.execute(
      {
        tenantId,
        bookingId: created.bookingId,
        confirmationToken: preview.getValue().confirmationToken,
        reason: "Missing folio activity",
      },
      adminActor,
    );
    expect(apply.isFailure).toBe(true);
    expect(apply.getError().message).toBe(
      COMMERCIAL_AMENDMENT_MISSING_FOLIO_ACTIVITY_MESSAGE,
    );
    await assertUnchanged(created.bookingId, before);

    // Property-scoped actor without access
    const created2 = await createConfirmedBooking({
      checkIn: "2027-08-10",
      checkOut: "2027-08-13",
    });
    await bumpRate("185.0000");
    const preview2 = await previewToken({
      bookingId: created2.bookingId,
      checkIn: created2.checkIn,
      checkOut: created2.checkOut,
      reason: "Unauthorized property",
    });
    expect(preview2.isSuccess).toBe(true);
    const before2 = await snapshotState(created2.bookingId);
    const restricted = {
      userId: adminUserId,
      role: "staff" as const,
      propertyIds: ["550e8400-e29b-41d4-a716-446655449999"],
    };
    const applyAuth = await applyFinancial.execute(
      {
        tenantId,
        bookingId: created2.bookingId,
        confirmationToken: preview2.getValue().confirmationToken,
        reason: "Unauthorized property",
      },
      restricted,
    );
    expect(applyAuth.isFailure).toBe(true);
    expect(applyAuth.getError()).toBeInstanceOf(ForbiddenError);
    await assertUnchanged(created2.bookingId, before2);

    // Expired token
    const created3 = await createConfirmedBooking({
      checkIn: "2027-08-20",
      checkOut: "2027-08-23",
    });
    await bumpRate("195.0000");
    const preview3 = await previewToken({
      bookingId: created3.bookingId,
      checkIn: created3.checkIn,
      checkOut: created3.checkOut,
      reason: "Expired token",
    });
    expect(preview3.isSuccess).toBe(true);
    const claims = confirmTokens.verify(preview3.getValue().confirmationToken)!;
    const expired = confirmTokens.issue({
      ...claims,
      now: new Date(Date.now() - 20 * 60_000),
      ttlSeconds: 60,
    });
    const before3 = await snapshotState(created3.bookingId);
    const applyExpired = await applyFinancial.execute(
      {
        tenantId,
        bookingId: created3.bookingId,
        confirmationToken: expired.token,
        reason: "Expired token",
      },
      adminActor,
    );
    expect(applyExpired.isFailure).toBe(true);
    expect(applyExpired.getError().message).toMatch(/invalid or expired/i);
    await assertUnchanged(created3.bookingId, before3);

    // Successful apply then wrong actor cannot replay
    const created4 = await createConfirmedBooking({
      checkIn: "2027-09-01",
      checkOut: "2027-09-04",
    });
    await bumpRate("205.0000");
    const preview4 = await previewToken({
      bookingId: created4.bookingId,
      checkIn: created4.checkIn,
      checkOut: created4.checkOut,
      reason: "Replay actor",
    });
    expect(preview4.isSuccess).toBe(true);
    const token4 = preview4.getValue().confirmationToken;
    const apply4 = await applyFinancial.execute(
      {
        tenantId,
        bookingId: created4.bookingId,
        confirmationToken: token4,
        reason: "Replay actor",
      },
      adminActor,
    );
    expect(apply4.isSuccess).toBe(true);
    const replayOk = await applyFinancial.execute(
      {
        tenantId,
        bookingId: created4.bookingId,
        confirmationToken: token4,
        reason: "Replay actor",
      },
      adminActor,
    );
    expect(replayOk.isSuccess).toBe(true);
    expect(replayOk.getValue().replayed).toBe(true);
    expect(replayOk.getValue().amendmentId).toBe(apply4.getValue().amendmentId);

    const audits = await withTenantTransaction(tenantId, async (tx) =>
      tx.auditLog.findMany({
        where: {
          tenantId,
          action: "booking.financial_reprice_applied",
          resourceId: created4.bookingId,
        },
      }),
    );
    expect(audits).toHaveLength(1);
    const meta = audits[0]!.metadata as Record<string, unknown>;
    expect(meta.confirmationReference).toBe(
      deriveFinancialRepriceConfirmationReference(token4),
    );
    expect(JSON.stringify(meta)).not.toContain(token4);

    const wrongActor = {
      userId: otherUserId,
      role: "admin" as const,
      propertyIds: null,
    };
    const replayWrong = await applyFinancial.execute(
      {
        tenantId,
        bookingId: created4.bookingId,
        confirmationToken: token4,
        reason: "Replay actor",
      },
      wrongActor,
    );
    expect(replayWrong.isFailure).toBe(true);
    expect(replayWrong.getError().message).toMatch(/different operator/i);
  });

  it("rolls back when folio append fails after quote mutation attempt", async () => {
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

    await bumpRate("220.0000");
    const preview = await previewToken({
      bookingId: created.bookingId,
      checkIn: created.checkIn,
      checkOut: created.checkOut,
      reason: "Folio append rollback",
    });
    expect(preview.isSuccess).toBe(true);

    const failingFolio = {
      findByBookingAndKey: (...args: Parameters<typeof folioRepository.findByBookingAndKey>) =>
        folioRepository.findByBookingAndKey(...args),
      findByBooking: (...args: Parameters<typeof folioRepository.findByBooking>) =>
        folioRepository.findByBooking(...args),
      lockPrimaryForUpdate: (...args: Parameters<typeof folioRepository.lockPrimaryForUpdate>) =>
        folioRepository.lockPrimaryForUpdate(...args),
      appendLines: async () => {
        throw new Error("force folio append failure");
      },
      findById: (...args: Parameters<typeof folioRepository.findById>) =>
        folioRepository.findById(...args),
      saveNew: (...args: Parameters<typeof folioRepository.saveNew>) =>
        folioRepository.saveNew(...args),
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
        folioRepository: failingFolio as never,
        paymentRepository,
        fiscalAllocationRepository: new PrismaFiscalAllocationRepository(),
        amendmentRepository,
        auditLogRepository,
        idGenerator,
      },
    );

    const before = await snapshotState(created.bookingId);
    const result = await applyFailing.execute(
      {
        tenantId,
        bookingId: created.bookingId,
        confirmationToken: preview.getValue().confirmationToken,
        reason: "Folio append rollback",
      },
      adminActor,
    );
    expect(result.isFailure).toBe(true);
    await assertUnchanged(created.bookingId, before);
  });

  it("rejects stale stay geometry after preserve stay-change", async () => {
    const created = await createConfirmedBooking({
      checkIn: "2027-06-01",
      checkOut: "2027-06-04",
    });
    await bumpRate("230.0000");
    const preview = await previewToken({
      bookingId: created.bookingId,
      checkIn: created.checkIn,
      checkOut: created.checkOut,
      reason: "Geometry stale",
    });
    expect(preview.isSuccess).toBe(true);

    // Preserve-path stay change extends checkout after token issuance.
    const { ChangeBookingStayUseCase } = await import("@hcp/domain");
    const changeStay = new ChangeBookingStayUseCase(
      bookingRepository,
      quoteRepository,
      commerceFlowRepository,
      reservationOrchestrator,
      permissionChecker,
      auditLogRepository,
    );
    const stay = await changeStay.execute(
      {
        tenantId,
        bookingId: created.bookingId,
        unitId,
        checkIn: created.checkIn,
        checkOut: "2027-06-05",
        guestCount: 2,
      },
      adminActor,
    );
    expect(stay.isSuccess).toBe(true);

    const before = await snapshotState(created.bookingId);
    const apply = await applyFinancial.execute(
      {
        tenantId,
        bookingId: created.bookingId,
        confirmationToken: preview.getValue().confirmationToken,
        reason: "Geometry stale",
      },
      adminActor,
    );
    expect(apply.isFailure).toBe(true);
    expect(apply.getError().message).toMatch(/stay geometry/i);
    await assertUnchanged(created.bookingId, before);
  });
});
