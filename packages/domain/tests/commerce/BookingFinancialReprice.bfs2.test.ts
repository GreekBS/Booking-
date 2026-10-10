import { createHmac, timingSafeEqual } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  ApplyBookingFinancialRepriceUseCase,
  BFS3_FINANCIAL_APPLY_GATE_MESSAGE,
  BOOKING_FINANCIAL_CONFIRM_TTL_SECONDS,
  BOOKING_FINANCIAL_CONFIRM_TYP,
  Booking,
  ChangeBookingStayUseCase,
  ForbiddenError,
  Hold,
  Money,
  PermissionChecker,
  PreviewBookingFinancialRepriceUseCase,
  Quote,
  Result,
  ValidationError,
  bookingProposedCommercialFingerprint,
  hashFinancialReason,
  type ActorContext,
  type BookingFinancialConfirmClaims,
  type IBookingFinancialConfirmTokenService,
} from "../../src/index";
import { StayMutationEngine } from "../../src/commerce/reservation/engines/StayMutationEngine";
import { QuoteFactory } from "../../src/commerce/reservation/engines/QuoteFactory";
import { PricingCalculator } from "../../src/commerce/pricing/PricingCalculator";
import { PERMISSIONS } from "@hcp/permissions";
import {
  baseRatePlan,
  createHoldForUnit,
  villaProperty,
  HOLD_CREATED_AT,
} from "./fixtures/commerceFixtures";

const TENANT = villaProperty.tenantId;
const UNIT = villaProperty.units[0]!.id;
const PROP = villaProperty.id;
const NOW = new Date(HOLD_CREATED_AT.getTime() + 5 * 60_000);

const admin: ActorContext = {
  userId: "admin-bfs2",
  role: "admin",
  propertyIds: null,
};

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
  constructor(private readonly secret = "test-booking-financial-secret") {}

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
    let claims: BookingFinancialConfirmClaims;
    try {
      claims = JSON.parse(
        fromB64url(payload).toString("utf8"),
      ) as BookingFinancialConfirmClaims;
    } catch {
      return null;
    }
    if (
      claims.typ !== BOOKING_FINANCIAL_CONFIRM_TYP ||
      Math.floor(now.getTime() / 1000) > claims.exp
    ) {
      return null;
    }
    return claims;
  }
}

function makeBooking(opts?: { total?: string; pricingMode?: "imported_csv" | "operator_entered" }) {
  const hold = createHoldForUnit(UNIT, PROP, "2025-08-01", "2025-08-04", {
    now: HOLD_CREATED_AT,
    guestCount: 2,
  });

  const quote = Quote.createFromFixedTotal({
    id: "quote-bfs2-1",
    snapshotId: "snap-bfs2-1",
    hold,
    propertyTimezone: villaProperty.timezone,
    total: Money.create(opts?.total ?? "300.0000", "EUR"),
    pricingMode: opts?.pricingMode ?? "talos_calculated",
    quotedAt: NOW,
  });

  const booking = Booking.create({
    id: "booking-bfs2-1",
    hold,
    quote,
    guest: { name: "BFS2 Guest", email: "bfs2@test.com", phone: null },
    confirmationMode: "manual",
    now: NOW,
  });

  return { booking, quote, hold };
}

function buildOrchestrator(opts?: {
  ratePlan?: typeof baseRatePlan;
  available?: boolean;
}) {
  const ratePlan = opts?.ratePlan ?? {
    ...baseRatePlan,
    baseNightlyAmount: "150.0000",
  };

  const priceStayDetailed = vi.fn(async (
    _tenantId: string,
    unitId: string,
    checkIn: string,
    checkOut: string,
  ) => {
    const quotedAt = new Date();
    const pricing = new PricingCalculator().calculate(
      ratePlan,
      Hold.create({
        id: "tmp",
        tenantId: TENANT,
        unitId,
        propertyId: PROP,
        checkIn,
        checkOut,
        guestCount: 2,
        now: quotedAt,
      }).stayPeriod,
      quotedAt,
    );
    return Result.ok({ pricing, ratePlan });
  });

  const priceStay = vi.fn(async (...args: Parameters<typeof priceStayDetailed>) => {
    const detailed = await priceStayDetailed(...args);
    if (detailed.isFailure) return Result.fail(detailed.getError());
    return Result.ok(detailed.getValue().pricing);
  });

  const availabilityEngine = {
    evaluate: vi.fn(async () =>
      Result.ok({
        available: opts?.available !== false,
        reasons:
          opts?.available === false
            ? [{ code: "blocked", message: "unavailable" }]
            : [],
        propertyId: PROP,
      }),
    ),
  };

  let n = 0;
  const engine = new StayMutationEngine(
    availabilityEngine as never,
    { priceStay, priceStayDetailed } as never,
    new QuoteFactory(),
    { getProperty: vi.fn(async () => villaProperty) } as never,
    {
      generate: () => {
        n += 1;
        return `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
      },
    },
  );

  const orchestrator = {
    previewStayChange: (
      booking: Booking,
      draft: Parameters<StayMutationEngine["previewStayChange"]>[1],
      quote: Quote,
      commercial?: Parameters<StayMutationEngine["previewStayChange"]>[3],
    ) => engine.previewStayChange(booking, draft, quote, commercial),
    commitStayChange: (
      booking: Booking,
      draft: Parameters<StayMutationEngine["commitStayChange"]>[1],
      quote: Quote,
      options?: Parameters<StayMutationEngine["commitStayChange"]>[3],
    ) => engine.commitStayChange(booking, draft, quote, options),
  };

  return {
    orchestrator,
    engine,
    priceStay,
    priceStayDetailed,
    ratePlan,
    availabilityEngine,
  };
}

function buildPreviewUseCase(opts?: {
  booking?: Booking | null;
  quote?: Quote | null;
  permissionChecker?: PermissionChecker;
  tokens?: IBookingFinancialConfirmTokenService;
  ratePlan?: typeof baseRatePlan;
}) {
  const { booking, quote } = makeBooking({ total: "300.0000" });
  const { orchestrator, priceStayDetailed, ratePlan } = buildOrchestrator({
    ratePlan: opts?.ratePlan,
  });
  const tokens = opts?.tokens ?? new TestFinancialConfirmTokens();
  const useCase = new PreviewBookingFinancialRepriceUseCase(
    {
      findById: vi.fn(async () =>
        opts?.booking === null ? null : (opts?.booking ?? booking),
      ),
    } as never,
    {
      findById: vi.fn(async () =>
        opts?.quote === null ? null : (opts?.quote ?? quote),
      ),
    } as never,
    orchestrator as never,
    opts?.permissionChecker ?? new PermissionChecker(),
    tokens,
  );
  return {
    useCase,
    booking: opts?.booking ?? booking,
    quote: opts?.quote ?? quote,
    tokens,
    priceStayDetailed,
    ratePlan,
    orchestrator,
  };
}

function buildApplyUseCase(opts?: {
  booking?: Booking;
  quote?: Quote;
  permissionChecker?: PermissionChecker;
  tokens?: IBookingFinancialConfirmTokenService;
  ratePlan?: typeof baseRatePlan;
  saveSpy?: ReturnType<typeof vi.fn>;
}) {
  const { booking, quote } = makeBooking({ total: "300.0000" });
  const activeBooking = opts?.booking ?? booking;
  const activeQuote = opts?.quote ?? quote;
  const { orchestrator, ratePlan } = buildOrchestrator({
    ratePlan: opts?.ratePlan,
  });
  const tokens = opts?.tokens ?? new TestFinancialConfirmTokens();
  const saveStayChange = opts?.saveSpy ?? vi.fn();
  const commerceFlowRepository = {
    runInTenantTransaction: vi.fn(async (_t: string, fn: () => Promise<unknown>) =>
      fn(),
    ),
    saveStayChange,
  };
  const safety = {
    folioRepository: {
      findByBookingAndKey: vi.fn(async () => null),
      findByBooking: vi.fn(async () => []),
    },
    paymentRepository: {
      listByBooking: vi.fn(async () => []),
    },
    fiscalAllocationRepository: {
      listByFolioId: vi.fn(async () => []),
    },
  };
  const useCase = new ApplyBookingFinancialRepriceUseCase(
    { findById: vi.fn(async () => activeBooking) } as never,
    { findById: vi.fn(async () => activeQuote) } as never,
    {
      findByUnitId: vi.fn(async () => ratePlan),
    } as never,
    commerceFlowRepository as never,
    orchestrator as never,
    opts?.permissionChecker ?? new PermissionChecker(),
    tokens,
    safety as never,
  );
  return {
    useCase,
    booking: activeBooking,
    quote: activeQuote,
    tokens,
    commerceFlowRepository,
    ratePlan,
    orchestrator,
  };
}

describe("BFS-2 booking financial reprice", () => {
  it("authorized preview returns current/proposed/delta, currency, commercial, reason, token", async () => {
    const { useCase, quote, priceStayDetailed } = buildPreviewUseCase();

    const result = await useCase.execute(
      {
        tenantId: TENANT,
        bookingId: "booking-bfs2-1",
        unitId: UNIT,
        checkIn: "2025-08-01",
        checkOut: "2025-08-05",
        guestCount: 2,
        reason: "Rate correction after plan update",
      },
      admin,
    );

    expect(result.isSuccess).toBe(true);
    const value = result.getValue();
    expect(value.available).toBe(true);
    expect(value.pricingIntent).toBe("recalculate_from_rate_plan");
    expect(value.current.totalAmount).toBe(quote.snapshot.totalAmount);
    expect(value.proposed?.totalAmount).toBe("600.0000");
    expect(value.proposed?.currency).toBe("EUR");
    expect(value.priceDelta?.currency).toBe("EUR");
    expect(value.priceDelta?.amount).toBe("300.0000");
    expect(value.proposedCommercial?.feesAmount).toBe("0.0000");
    expect(value.proposedCommercial?.taxesAmount).toBe("0.0000");
    expect(value.proposedCommercial?.discountAmount).toBe("0.0000");
    expect(value.proposedCommercial?.pricingFingerprint).toHaveLength(64);
    expect(value.reason).toBe("Rate correction after plan update");
    expect(value.confirmationToken.includes(".")).toBe(true);
    expect(value.confirmationExpiresAt).toBeTruthy();
    expect(priceStayDetailed).toHaveBeenCalled();
  });

  it("rejects preview without financial-adjust permission even with booking update", async () => {
    const checker = {
      hasPermission: (actor: ActorContext, permission: string, tenantId: string) => {
        if (permission === PERMISSIONS.BOOKING_FINANCIAL_ADJUST_TENANT) {
          return false;
        }
        return new PermissionChecker().hasPermission(
          actor,
          permission as never,
          tenantId,
        );
      },
    };
    const { useCase } = buildPreviewUseCase({
      permissionChecker: checker as never,
    });

    const result = await useCase.execute(
      {
        tenantId: TENANT,
        bookingId: "booking-bfs2-1",
        unitId: UNIT,
        checkIn: "2025-08-01",
        checkOut: "2025-08-05",
        guestCount: 2,
        reason: "Should be denied",
      },
      admin,
    );

    expect(result.isFailure).toBe(true);
    expect(result.getError()).toBeInstanceOf(ForbiddenError);
  });

  it("rejects preview with missing/short reason", async () => {
    const { useCase } = buildPreviewUseCase();
    const result = await useCase.execute(
      {
        tenantId: TENANT,
        bookingId: "booking-bfs2-1",
        unitId: UNIT,
        checkIn: "2025-08-01",
        checkOut: "2025-08-05",
        guestCount: 2,
        reason: "ab",
      },
      admin,
    );
    expect(result.isFailure).toBe(true);
    expect(result.getError().message).toMatch(/reason/i);
  });

  it("preview performs no booking/quote/folio writes", async () => {
    const saveStayChange = vi.fn();
    const { booking, quote } = makeBooking();
    const { orchestrator } = buildOrchestrator();
    const useCase = new PreviewBookingFinancialRepriceUseCase(
      { findById: vi.fn(async () => booking) } as never,
      { findById: vi.fn(async () => quote) } as never,
      orchestrator as never,
      new PermissionChecker(),
      new TestFinancialConfirmTokens(),
    );

    await useCase.execute(
      {
        tenantId: TENANT,
        bookingId: booking.id,
        unitId: UNIT,
        checkIn: "2025-08-01",
        checkOut: "2025-08-05",
        guestCount: 2,
        reason: "No writes expected",
      },
      admin,
    );

    expect(saveStayChange).not.toHaveBeenCalled();
    expect(booking.quoteId).toBe(quote.id);
    expect(quote.snapshot.totalAmount).toBe("300.0000");
  });

  it("issues a valid confirmation token bound to actor/quote/pricing/reason", async () => {
    const tokens = new TestFinancialConfirmTokens();
    const { useCase, quote } = buildPreviewUseCase({ tokens });
    const previewed = await useCase.execute(
      {
        tenantId: TENANT,
        bookingId: "booking-bfs2-1",
        unitId: UNIT,
        checkIn: "2025-08-01",
        checkOut: "2025-08-05",
        guestCount: 2,
        reason: "Bound token reason",
      },
      admin,
    );
    expect(previewed.isSuccess).toBe(true);
    const claims = tokens.verify(previewed.getValue().confirmationToken);
    expect(claims).not.toBeNull();
    expect(claims!.actorId).toBe(admin.userId);
    expect(claims!.currentQuoteId).toBe(quote.id);
    expect(claims!.currentTotalAmount).toBe(quote.snapshot.totalAmount);
    expect(claims!.reasonHash).toBe(hashFinancialReason("Bound token reason"));
    expect(claims!.pricingIntent).toBe("recalculate_from_rate_plan");
  });

  it("rejects expired confirmation tokens", async () => {
    const tokens = new TestFinancialConfirmTokens();
    const { useCase } = buildApplyUseCase({ tokens });
    const issued = tokens.issue({
      tenantId: TENANT,
      propertyId: PROP,
      bookingId: "booking-bfs2-1",
      actorId: admin.userId,
      pricingIntent: "recalculate_from_rate_plan",
      currentQuoteId: "quote-bfs2-1",
      currentSnapshotId: "snap-bfs2-1",
      currentTotalAmount: "300.0000",
      currency: "EUR",
      unitId: UNIT,
      checkIn: "2025-08-01",
      checkOut: "2025-08-05",
      guestCount: 2,
      proposedTotalAmount: "600.0000",
      proposedSubtotalAmount: "600.0000",
      proposedFeesAmount: "0.0000",
      proposedTaxesAmount: "0.0000",
      proposedDiscountAmount: "0.0000",
      pricingFingerprint: "a".repeat(64),
      reasonHash: hashFinancialReason("Expired path"),
      now: new Date(Date.now() - 20 * 60_000),
      ttlSeconds: 60,
    });

    const result = await useCase.execute(
      {
        tenantId: TENANT,
        bookingId: "booking-bfs2-1",
        confirmationToken: issued.token,
        reason: "Expired path",
      },
      admin,
    );
    expect(result.isFailure).toBe(true);
    expect(result.getError().message).toMatch(/invalid or expired/i);
  });

  it("rejects tampered confirmation tokens", async () => {
    const { useCase, tokens, booking, quote, ratePlan, orchestrator } =
      buildApplyUseCase();
    const previewEngine = orchestrator as {
      previewStayChange: typeof StayMutationEngine.prototype.previewStayChange;
    };
    const preview = await previewEngine.previewStayChange(
      booking,
      {
        unitId: UNIT,
        checkIn: "2025-08-01",
        checkOut: "2025-08-05",
        guestCount: 2,
      },
      quote,
      { source: "operator", pricingIntent: "recalculate_from_rate_plan" },
    );
    const commercial = preview.getValue().proposedCommercial!;
    const issued = tokens.issue({
      tenantId: TENANT,
      propertyId: PROP,
      bookingId: booking.id,
      actorId: admin.userId,
      pricingIntent: "recalculate_from_rate_plan",
      currentQuoteId: quote.id,
      currentSnapshotId: quote.snapshotId,
      currentTotalAmount: quote.snapshot.totalAmount,
      currency: quote.snapshot.currency,
      unitId: UNIT,
      checkIn: "2025-08-01",
      checkOut: "2025-08-05",
      guestCount: 2,
      proposedTotalAmount: commercial.totalAmount,
      proposedSubtotalAmount: commercial.subtotalAmount,
      proposedFeesAmount: commercial.feesAmount,
      proposedTaxesAmount: commercial.taxesAmount,
      proposedDiscountAmount: commercial.discountAmount,
      pricingFingerprint: commercial.pricingFingerprint,
      reasonHash: hashFinancialReason("Tamper check"),
    });
    void ratePlan;
    const tampered = `${issued.token.slice(0, -4)}xxxx`;

    const result = await useCase.execute(
      {
        tenantId: TENANT,
        bookingId: booking.id,
        confirmationToken: tampered,
        reason: "Tamper check",
      },
      admin,
    );
    expect(result.isFailure).toBe(true);
    expect(result.getError().message).toMatch(/invalid or expired/i);
  });

  it("rejects wrong actor", async () => {
    const tokens = new TestFinancialConfirmTokens();
    const { useCase, booking, quote, orchestrator } = buildApplyUseCase({
      tokens,
    });
    const preview = await orchestrator.previewStayChange(
      booking,
      {
        unitId: UNIT,
        checkIn: "2025-08-01",
        checkOut: "2025-08-05",
        guestCount: 2,
      },
      quote,
      { source: "operator", pricingIntent: "recalculate_from_rate_plan" },
    );
    const commercial = preview.getValue().proposedCommercial!;
    const issued = tokens.issue({
      tenantId: TENANT,
      propertyId: PROP,
      bookingId: booking.id,
      actorId: "other-operator",
      pricingIntent: "recalculate_from_rate_plan",
      currentQuoteId: quote.id,
      currentSnapshotId: quote.snapshotId,
      currentTotalAmount: quote.snapshot.totalAmount,
      currency: quote.snapshot.currency,
      unitId: UNIT,
      checkIn: "2025-08-01",
      checkOut: "2025-08-05",
      guestCount: 2,
      proposedTotalAmount: commercial.totalAmount,
      proposedSubtotalAmount: commercial.subtotalAmount,
      proposedFeesAmount: commercial.feesAmount,
      proposedTaxesAmount: commercial.taxesAmount,
      proposedDiscountAmount: commercial.discountAmount,
      pricingFingerprint: commercial.pricingFingerprint,
      reasonHash: hashFinancialReason("Wrong actor"),
    });

    const result = await useCase.execute(
      {
        tenantId: TENANT,
        bookingId: booking.id,
        confirmationToken: issued.token,
        reason: "Wrong actor",
      },
      admin,
    );
    expect(result.isFailure).toBe(true);
    expect(result.getError().message).toMatch(/different operator/i);
  });

  it("rejects cross-tenant confirmation", async () => {
    const tokens = new TestFinancialConfirmTokens();
    const { useCase, booking, quote, orchestrator } = buildApplyUseCase({
      tokens,
    });
    const preview = await orchestrator.previewStayChange(
      booking,
      {
        unitId: UNIT,
        checkIn: "2025-08-01",
        checkOut: "2025-08-05",
        guestCount: 2,
      },
      quote,
      { source: "operator", pricingIntent: "recalculate_from_rate_plan" },
    );
    const commercial = preview.getValue().proposedCommercial!;
    const issued = tokens.issue({
      tenantId: "other-tenant",
      propertyId: PROP,
      bookingId: booking.id,
      actorId: admin.userId,
      pricingIntent: "recalculate_from_rate_plan",
      currentQuoteId: quote.id,
      currentSnapshotId: quote.snapshotId,
      currentTotalAmount: quote.snapshot.totalAmount,
      currency: quote.snapshot.currency,
      unitId: UNIT,
      checkIn: "2025-08-01",
      checkOut: "2025-08-05",
      guestCount: 2,
      proposedTotalAmount: commercial.totalAmount,
      proposedSubtotalAmount: commercial.subtotalAmount,
      proposedFeesAmount: commercial.feesAmount,
      proposedTaxesAmount: commercial.taxesAmount,
      proposedDiscountAmount: commercial.discountAmount,
      pricingFingerprint: commercial.pricingFingerprint,
      reasonHash: hashFinancialReason("Cross tenant"),
    });

    const result = await useCase.execute(
      {
        tenantId: TENANT,
        bookingId: booking.id,
        confirmationToken: issued.token,
        reason: "Cross tenant",
      },
      admin,
    );
    expect(result.isFailure).toBe(true);
    expect(result.getError().message).toMatch(/does not match this booking/i);
  });

  it("rejects when current quote changed since preview", async () => {
    const tokens = new TestFinancialConfirmTokens();
    const { booking, quote } = makeBooking({ total: "300.0000" });
    const { useCase, orchestrator } = buildApplyUseCase({
      tokens,
      booking,
      quote,
    });
    const preview = await orchestrator.previewStayChange(
      booking,
      {
        unitId: UNIT,
        checkIn: "2025-08-01",
        checkOut: "2025-08-05",
        guestCount: 2,
      },
      quote,
      { source: "operator", pricingIntent: "recalculate_from_rate_plan" },
    );
    const commercial = preview.getValue().proposedCommercial!;
    const issued = tokens.issue({
      tenantId: TENANT,
      propertyId: PROP,
      bookingId: booking.id,
      actorId: admin.userId,
      pricingIntent: "recalculate_from_rate_plan",
      currentQuoteId: quote.id,
      currentSnapshotId: "stale-snapshot",
      currentTotalAmount: quote.snapshot.totalAmount,
      currency: quote.snapshot.currency,
      unitId: UNIT,
      checkIn: "2025-08-01",
      checkOut: "2025-08-05",
      guestCount: 2,
      proposedTotalAmount: commercial.totalAmount,
      proposedSubtotalAmount: commercial.subtotalAmount,
      proposedFeesAmount: commercial.feesAmount,
      proposedTaxesAmount: commercial.taxesAmount,
      proposedDiscountAmount: commercial.discountAmount,
      pricingFingerprint: commercial.pricingFingerprint,
      reasonHash: hashFinancialReason("Quote changed"),
    });

    const result = await useCase.execute(
      {
        tenantId: TENANT,
        bookingId: booking.id,
        confirmationToken: issued.token,
        reason: "Quote changed",
      },
      admin,
    );
    expect(result.isFailure).toBe(true);
    expect(result.getError().message).toMatch(/stale/i);
  });

  it("rejects when RatePlan / proposed pricing changed since preview", async () => {
    const tokens = new TestFinancialConfirmTokens();
    const { booking, quote } = makeBooking({ total: "300.0000" });
    const { useCase, orchestrator } = buildApplyUseCase({
      tokens,
      booking,
      quote,
      ratePlan: { ...baseRatePlan, baseNightlyAmount: "200.0000" },
    });
    const preview = await orchestrator.previewStayChange(
      booking,
      {
        unitId: UNIT,
        checkIn: "2025-08-01",
        checkOut: "2025-08-05",
        guestCount: 2,
      },
      quote,
      { source: "operator", pricingIntent: "recalculate_from_rate_plan" },
    );
    const commercial = preview.getValue().proposedCommercial!;
    const issued = tokens.issue({
      tenantId: TENANT,
      propertyId: PROP,
      bookingId: booking.id,
      actorId: admin.userId,
      pricingIntent: "recalculate_from_rate_plan",
      currentQuoteId: quote.id,
      currentSnapshotId: quote.snapshotId,
      currentTotalAmount: quote.snapshot.totalAmount,
      currency: quote.snapshot.currency,
      unitId: UNIT,
      checkIn: "2025-08-01",
      checkOut: "2025-08-05",
      guestCount: 2,
      proposedTotalAmount: "999.0000",
      proposedSubtotalAmount: commercial.subtotalAmount,
      proposedFeesAmount: commercial.feesAmount,
      proposedTaxesAmount: commercial.taxesAmount,
      proposedDiscountAmount: commercial.discountAmount,
      pricingFingerprint: commercial.pricingFingerprint,
      reasonHash: hashFinancialReason("Pricing changed"),
    });

    const result = await useCase.execute(
      {
        tenantId: TENANT,
        bookingId: booking.id,
        confirmationToken: issued.token,
        reason: "Pricing changed",
      },
      admin,
    );
    expect(result.isFailure).toBe(true);
    expect(result.getError().message).toMatch(/stale/i);
  });

  it("rejects apply with missing financial permission", async () => {
    const checker = {
      hasPermission: (actor: ActorContext, permission: string, tenantId: string) => {
        if (permission === PERMISSIONS.BOOKING_FINANCIAL_ADJUST_TENANT) {
          return false;
        }
        return new PermissionChecker().hasPermission(
          actor,
          permission as never,
          tenantId,
        );
      },
    };
    const { useCase, tokens, booking, quote, orchestrator } = buildApplyUseCase({
      permissionChecker: checker as never,
    });
    const preview = await orchestrator.previewStayChange(
      booking,
      {
        unitId: UNIT,
        checkIn: "2025-08-01",
        checkOut: "2025-08-05",
        guestCount: 2,
      },
      quote,
      { source: "operator", pricingIntent: "recalculate_from_rate_plan" },
    );
    const commercial = preview.getValue().proposedCommercial!;
    const issued = tokens.issue({
      tenantId: TENANT,
      propertyId: PROP,
      bookingId: booking.id,
      actorId: admin.userId,
      pricingIntent: "recalculate_from_rate_plan",
      currentQuoteId: quote.id,
      currentSnapshotId: quote.snapshotId,
      currentTotalAmount: quote.snapshot.totalAmount,
      currency: quote.snapshot.currency,
      unitId: UNIT,
      checkIn: "2025-08-01",
      checkOut: "2025-08-05",
      guestCount: 2,
      proposedTotalAmount: commercial.totalAmount,
      proposedSubtotalAmount: commercial.subtotalAmount,
      proposedFeesAmount: commercial.feesAmount,
      proposedTaxesAmount: commercial.taxesAmount,
      proposedDiscountAmount: commercial.discountAmount,
      pricingFingerprint: commercial.pricingFingerprint,
      reasonHash: hashFinancialReason("No finance perm"),
    });

    const result = await useCase.execute(
      {
        tenantId: TENANT,
        bookingId: booking.id,
        confirmationToken: issued.token,
        reason: "No finance perm",
      },
      admin,
    );
    expect(result.isFailure).toBe(true);
    expect(result.getError()).toBeInstanceOf(ForbiddenError);
  });

  it("valid confirmation still cannot bypass BFS-3 financial apply gate", async () => {
    const tokens = new TestFinancialConfirmTokens();
    const saveSpy = vi.fn();
    const { useCase, booking, quote, orchestrator, commerceFlowRepository } =
      buildApplyUseCase({ tokens, saveSpy });
    const preview = await orchestrator.previewStayChange(
      booking,
      {
        unitId: UNIT,
        checkIn: "2025-08-01",
        checkOut: "2025-08-05",
        guestCount: 2,
      },
      quote,
      { source: "operator", pricingIntent: "recalculate_from_rate_plan" },
    );
    const commercial = preview.getValue().proposedCommercial!;
    const issued = tokens.issue({
      tenantId: TENANT,
      propertyId: PROP,
      bookingId: booking.id,
      actorId: admin.userId,
      pricingIntent: "recalculate_from_rate_plan",
      currentQuoteId: quote.id,
      currentSnapshotId: quote.snapshotId,
      currentTotalAmount: quote.snapshot.totalAmount,
      currency: quote.snapshot.currency,
      unitId: UNIT,
      checkIn: "2025-08-01",
      checkOut: "2025-08-05",
      guestCount: 2,
      proposedTotalAmount: commercial.totalAmount,
      proposedSubtotalAmount: commercial.subtotalAmount,
      proposedFeesAmount: commercial.feesAmount,
      proposedTaxesAmount: commercial.taxesAmount,
      proposedDiscountAmount: commercial.discountAmount,
      pricingFingerprint: commercial.pricingFingerprint,
      reasonHash: hashFinancialReason("Valid but gated"),
    });

    const result = await useCase.execute(
      {
        tenantId: TENANT,
        bookingId: booking.id,
        confirmationToken: issued.token,
        reason: "Valid but gated",
      },
      admin,
    );

    expect(result.isFailure).toBe(true);
    expect(result.getError()).toBeInstanceOf(ValidationError);
    expect(result.getError().message).toBe(BFS3_FINANCIAL_APPLY_GATE_MESSAGE);
    expect(commerceFlowRepository.runInTenantTransaction).toHaveBeenCalled();
    expect(saveSpy).not.toHaveBeenCalled();
    expect(booking.quoteId).toBe(quote.id);
    expect(quote.snapshot.totalAmount).toBe("300.0000");
  });

  it("StayMutationEngine commit blocks recalculate; preserve path unchanged", async () => {
    const { booking, quote } = makeBooking({
      total: "444.5000",
      pricingMode: "imported_csv",
    });
    const { engine, priceStay } = buildOrchestrator();

    const blocked = await engine.commitStayChange(
      booking,
      {
        unitId: UNIT,
        checkIn: "2025-08-01",
        checkOut: "2025-08-06",
        guestCount: 2,
      },
      quote,
      {
        commercial: {
          source: "operator",
          pricingIntent: "recalculate_from_rate_plan",
        },
      },
    );
    expect(blocked.isFailure).toBe(true);
    expect(blocked.getError().message).toBe(BFS3_FINANCIAL_APPLY_GATE_MESSAGE);

    const preserved = await engine.commitStayChange(
      booking,
      {
        unitId: UNIT,
        checkIn: "2025-08-01",
        checkOut: "2025-08-06",
        guestCount: 3,
      },
      quote,
      { commercial: { source: "operator", pricingIntent: "preserve_agreed_total" } },
    );
    expect(preserved.isSuccess).toBe(true);
    expect(preserved.getValue().quote.snapshot.totalAmount).toBe("444.5000");
    expect(preserved.getValue().quote.snapshot.pricingMode).toBe("imported_csv");
    expect(priceStay).not.toHaveBeenCalled();
  });

  it("ChangeBookingStay preview rejects recalculate; requires financial endpoint", async () => {
    const { booking, quote } = makeBooking();
    const { orchestrator } = buildOrchestrator();
    const useCase = new ChangeBookingStayUseCase(
      { findById: vi.fn(async () => booking) } as never,
      { findById: vi.fn(async () => quote) } as never,
      {
        runInTenantTransaction: vi.fn(),
        saveStayChange: vi.fn(),
      } as never,
      orchestrator as never,
      new PermissionChecker(),
      { append: vi.fn() },
    );

    const result = await useCase.preview(
      {
        tenantId: TENANT,
        bookingId: booking.id,
        unitId: UNIT,
        checkIn: "2025-08-01",
        checkOut: "2025-08-05",
        guestCount: 2,
        pricingIntent: "recalculate_from_rate_plan",
      },
      admin,
    );
    expect(result.isFailure).toBe(true);
    expect(result.getError().message).toMatch(/financial reprice preview/i);
  });

  it("channel_compat_reprice remains operational and isolated", async () => {
    const { booking, quote } = makeBooking({ total: "300.0000" });
    const { engine, priceStay } = buildOrchestrator();

    const result = await engine.commitStayChange(
      booking,
      {
        unitId: UNIT,
        checkIn: "2025-08-01",
        checkOut: "2025-08-05",
        guestCount: 2,
      },
      quote,
      { commercial: { source: "channel_compat_reprice" } },
    );

    expect(result.isSuccess).toBe(true);
    expect(priceStay).toHaveBeenCalled();
    expect(result.getValue().quote.snapshot.pricingMode).toBe("talos_calculated");
  });

  it("fingerprint binds RatePlan content and proposed commercial amounts", () => {
    const a = bookingProposedCommercialFingerprint({
      ratePlan: baseRatePlan,
      unitId: UNIT,
      checkIn: "2025-08-01",
      checkOut: "2025-08-05",
      guestCount: 2,
      subtotalAmount: "400.0000",
      feesAmount: "0.0000",
      taxesAmount: "0.0000",
      discountAmount: "0.0000",
      totalAmount: "400.0000",
      currency: "EUR",
      lineItems: [],
    });
    const b = bookingProposedCommercialFingerprint({
      ratePlan: { ...baseRatePlan, baseNightlyAmount: "101.0000" },
      unitId: UNIT,
      checkIn: "2025-08-01",
      checkOut: "2025-08-05",
      guestCount: 2,
      subtotalAmount: "400.0000",
      feesAmount: "0.0000",
      taxesAmount: "0.0000",
      discountAmount: "0.0000",
      totalAmount: "400.0000",
      currency: "EUR",
      lineItems: [],
    });
    expect(a).not.toBe(b);
    expect(a).toHaveLength(64);
  });
});
