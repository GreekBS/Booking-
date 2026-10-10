import { createHmac, timingSafeEqual } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  ApplyBookingFinancialRepriceUseCase,
  BFS3_FINANCIAL_APPLY_GATE_MESSAGE,
  BOOKING_FINANCIAL_CONFIRM_TTL_SECONDS,
  BOOKING_FINANCIAL_CONFIRM_TYP,
  Booking,
  COMMERCIAL_AMENDMENT_FISCAL_COVERAGE_MESSAGE,
  COMMERCIAL_AMENDMENT_FOLIO_BASELINE_MESSAGE,
  COMMERCIAL_AMENDMENT_FOLIO_CLOSED_MESSAGE,
  COMMERCIAL_AMENDMENT_MISSING_FOLIO_ACTIVITY_MESSAGE,
  COMMERCIAL_AMENDMENT_ZERO_DELTA_MESSAGE,
  COMMERCIAL_FEE_TAX_POLICY_A_MESSAGE,
  Folio,
  FolioLine,
  IMPORTED_OPERATOR_REPRICE_BLOCK_MESSAGE,
  Money,
  PermissionChecker,
  Quote,
  Result,
  ValidationError,
  accommodationHasFiscalCoverage,
  assertFinancialRepriceFolioGuards,
  assertFinancialRepriceQuoteGuards,
  assertFolioCommercialBaselineReconciles,
  hashFinancialReason,
  type ActorContext,
  type BookingFinancialConfirmClaims,
  type IBookingFinancialConfirmTokenService,
} from "../../src/index";
import { FiscalLineAllocation } from "../../src/fiscal/documents/FiscalAllocation";
import { StayMutationEngine } from "../../src/commerce/reservation/engines/StayMutationEngine";
import { QuoteFactory } from "../../src/commerce/reservation/engines/QuoteFactory";
import { PricingCalculator } from "../../src/commerce/pricing/PricingCalculator";
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
  userId: "admin-bfs3b1",
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
  constructor(private readonly secret = "test-bfs3b1-secret") {}

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

function openFolioWithAccommodation(
  total: string,
  status: "open" | "closed" = "open",
) {
  const folio = Folio.open({
    id: "11111111-1111-4111-8111-111111111111",
    tenantId: TENANT,
    bookingId: "22222222-2222-4222-8222-222222222222",
    currency: "EUR",
  });
  const line = FolioLine.createPosted({
    id: "33333333-3333-4333-8333-333333333333",
    tenantId: TENANT,
    folioId: folio.id,
    lineType: "accommodation",
    description: "Stay",
    amount: Money.create(total, "EUR"),
    source: {
      sourceType: "quote_snapshot",
      sourceId: "quote-1",
      sourceLineRef: "accommodation",
    },
    sortOrder: 0,
  });
  folio.appendPostedLine(line);
  if (status === "closed") {
    return Folio.rehydrate({ ...folio.toProps(), status: "closed" }, [
      ...folio.lines,
    ]);
  }
  return folio;
}

describe("BFS-3b-1 financial reprice safety guards", () => {
  it("rejects Policy A nonzero fees/taxes and imported pricing modes", () => {
    expect(() =>
      assertFinancialRepriceQuoteGuards({
        pricingMode: "talos_calculated",
        currentFeesAmount: "10.0000",
        currentTaxesAmount: "0.0000",
        proposedFeesAmount: "0.0000",
        proposedTaxesAmount: "0.0000",
        currency: "EUR",
        currentTotalAmount: "100.0000",
        proposedTotalAmount: "120.0000",
      }),
    ).toThrow(COMMERCIAL_FEE_TAX_POLICY_A_MESSAGE);

    expect(() =>
      assertFinancialRepriceQuoteGuards({
        pricingMode: "imported_csv",
        currentFeesAmount: "0.0000",
        currentTaxesAmount: "0.0000",
        proposedFeesAmount: "0.0000",
        proposedTaxesAmount: "0.0000",
        currency: "EUR",
        currentTotalAmount: "100.0000",
        proposedTotalAmount: "120.0000",
      }),
    ).toThrow(IMPORTED_OPERATOR_REPRICE_BLOCK_MESSAGE);
  });

  it("rejects zero-delta and closed/fiscal/baseline/missing-folio cases", () => {
    expect(() =>
      assertFinancialRepriceQuoteGuards({
        pricingMode: "talos_calculated",
        currentFeesAmount: "0.0000",
        currentTaxesAmount: "0.0000",
        proposedFeesAmount: "0.0000",
        proposedTaxesAmount: "0.0000",
        currency: "EUR",
        currentTotalAmount: "100.0000",
        proposedTotalAmount: "100.0000",
      }),
    ).toThrow(COMMERCIAL_AMENDMENT_ZERO_DELTA_MESSAGE);

    expect(() =>
      assertFinancialRepriceFolioGuards({
        primaryFolio: null,
        paymentCount: 1,
        fiscalAllocationCount: 0,
        expectedAgreedTotal: "100.0000",
        allocationsOnPrimary: [],
      }),
    ).toThrow(COMMERCIAL_AMENDMENT_MISSING_FOLIO_ACTIVITY_MESSAGE);

    expect(() =>
      assertFinancialRepriceFolioGuards({
        primaryFolio: openFolioWithAccommodation("100.0000", "closed"),
        paymentCount: 0,
        fiscalAllocationCount: 0,
        expectedAgreedTotal: "100.0000",
        allocationsOnPrimary: [],
      }),
    ).toThrow(COMMERCIAL_AMENDMENT_FOLIO_CLOSED_MESSAGE);

    const open = openFolioWithAccommodation("100.0000");
    const allocation = FiscalLineAllocation.create({
      id: "44444444-4444-4444-8444-444444444444",
      tenantId: TENANT,
      folioId: open.id,
      folioLineId: open.lines[0]!.id,
      fiscalDocumentId: "55555555-5555-4555-8555-555555555555",
      fiscalDocumentLineId: "66666666-6666-4666-8666-666666666666",
      allocatedAmount: "50.0000",
      currency: "EUR",
      createdAt: new Date(),
    });
    expect(accommodationHasFiscalCoverage(open, [allocation])).toBe(true);
    expect(() =>
      assertFinancialRepriceFolioGuards({
        primaryFolio: open,
        paymentCount: 0,
        fiscalAllocationCount: 1,
        expectedAgreedTotal: "100.0000",
        allocationsOnPrimary: [allocation],
      }),
    ).toThrow(COMMERCIAL_AMENDMENT_FISCAL_COVERAGE_MESSAGE);

    expect(() =>
      assertFolioCommercialBaselineReconciles({
        folio: openFolioWithAccommodation("80.0000"),
        expectedAgreedTotal: "100.0000",
      }),
    ).toThrow(COMMERCIAL_AMENDMENT_FOLIO_BASELINE_MESSAGE);
  });

  it("apply runs folio guards then still hard-gates without writes", async () => {
    const hold = createHoldForUnit(UNIT, PROP, "2025-08-01", "2025-08-04", {
      now: HOLD_CREATED_AT,
      guestCount: 2,
    });
    const quote = Quote.createFromFixedTotal({
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      snapshotId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      hold,
      propertyTimezone: villaProperty.timezone,
      total: Money.create("300.0000", "EUR"),
      pricingMode: "talos_calculated",
      quotedAt: NOW,
    });
    const booking = Booking.create({
      id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      hold,
      quote,
      guest: { name: "BFS3b1", email: "b@test.com", phone: null },
      confirmationMode: "manual",
      now: NOW,
    });

    const ratePlan = { ...baseRatePlan, baseNightlyAmount: "250.0000" };
    const priceStayDetailed = vi.fn(async () => {
      const pricing = new PricingCalculator().calculate(
        ratePlan,
        hold.stayPeriod,
        NOW,
      );
      return Result.ok({ pricing, ratePlan });
    });
    const priceStay = vi.fn(async () => {
      const detailed = await priceStayDetailed();
      return Result.ok(detailed.getValue().pricing);
    });
    const engine = new StayMutationEngine(
      {
        evaluate: vi.fn(async () =>
          Result.ok({ available: true, reasons: [], propertyId: PROP }),
        ),
      } as never,
      { priceStay, priceStayDetailed } as never,
      new QuoteFactory(),
      { getProperty: vi.fn(async () => villaProperty) } as never,
      {
        nextId: vi.fn(() => "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee"),
      } as never,
    );

    const tokens = new TestFinancialConfirmTokens();
    const saveSpy = vi.fn();
    const folio = Folio.rehydrate(
      {
        ...openFolioWithAccommodation(quote.snapshot.totalAmount).toProps(),
        bookingId: booking.id,
      },
      [...openFolioWithAccommodation(quote.snapshot.totalAmount).lines],
    );

    const useCase = new ApplyBookingFinancialRepriceUseCase(
      { findById: vi.fn(async () => booking) } as never,
      { findById: vi.fn(async () => quote) } as never,
      { findByUnitId: vi.fn(async () => ratePlan) } as never,
      {
        runInTenantTransaction: vi.fn(async (_t, fn) => fn()),
        saveStayChange: saveSpy,
      } as never,
      {
        previewStayChange: (
          ...args: Parameters<StayMutationEngine["previewStayChange"]>
        ) => engine.previewStayChange(...args),
      } as never,
      new PermissionChecker(),
      tokens,
      {
        folioRepository: {
          findByBookingAndKey: vi.fn(async () => ({
            folio,
            lines: [...folio.lines],
          })),
          findByBooking: vi.fn(async () => [
            { folio, lines: [...folio.lines] },
          ]),
        } as never,
        paymentRepository: { listByBooking: vi.fn(async () => []) } as never,
        fiscalAllocationRepository: {
          listByFolioId: vi.fn(async () => []),
        } as never,
      },
    );

    const preview = await engine.previewStayChange(
      booking,
      {
        unitId: UNIT,
        checkIn: "2025-08-01",
        checkOut: "2025-08-04",
        guestCount: 2,
      },
      quote,
      { source: "operator", pricingIntent: "recalculate_from_rate_plan" },
    );
    expect(preview.isSuccess).toBe(true);
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
      checkOut: "2025-08-04",
      guestCount: 2,
      proposedTotalAmount: commercial.totalAmount,
      proposedSubtotalAmount: commercial.subtotalAmount,
      proposedFeesAmount: commercial.feesAmount,
      proposedTaxesAmount: commercial.taxesAmount,
      proposedDiscountAmount: commercial.discountAmount,
      pricingFingerprint: commercial.pricingFingerprint,
      reasonHash: hashFinancialReason("Guarded but gated"),
    });

    const result = await useCase.execute(
      {
        tenantId: TENANT,
        bookingId: booking.id,
        confirmationToken: issued.token,
        reason: "Guarded but gated",
      },
      admin,
    );

    expect(result.isFailure).toBe(true);
    expect(result.getError()).toBeInstanceOf(ValidationError);
    expect(result.getError().message).toBe(BFS3_FINANCIAL_APPLY_GATE_MESSAGE);
    expect(saveSpy).not.toHaveBeenCalled();
    expect(booking.quoteId).toBe(quote.id);
  });
});
