import { describe, expect, it } from "vitest";
import {
  assertCommercialFeeTaxPolicyA,
  assertPricingModeAllowsAutomaticRatePlanReprice,
  BFS3_FINANCIAL_APPLY_GATE_MESSAGE,
  BookingCommercialAmendment,
  COMMERCIAL_AMENDMENT_FISCAL_COVERAGE_MESSAGE,
  COMMERCIAL_AMENDMENT_FOLIO_CLOSED_MESSAGE,
  COMMERCIAL_FEE_TAX_POLICY_A_MESSAGE,
  Folio,
  FolioLine,
  IMPORTED_OPERATOR_REPRICE_BLOCK_MESSAGE,
  Money,
  ValidationError,
  commercialAmendmentAdjustmentLineSpec,
  validateCommercialAmendmentFolioAdjustment,
} from "../../src/index";

const TENANT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PROP = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const BOOKING = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const Q1 = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const Q2 = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const ACTOR = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const AMENDMENT = "11111111-1111-4111-8111-111111111111";
const FP = "a".repeat(64);
const REF = "b".repeat(64);

function validInput(
  overrides: Partial<Parameters<typeof BookingCommercialAmendment.create>[0]> = {},
) {
  return {
    id: AMENDMENT,
    tenantId: TENANT,
    propertyId: PROP,
    bookingId: BOOKING,
    previousQuoteId: Q1,
    newQuoteId: Q2,
    previousTotalAmount: "300.0000",
    newTotalAmount: "450.0000",
    currency: "EUR",
    pricingIntent: "recalculate_from_rate_plan" as const,
    reason: "Rate plan correction",
    actorId: ACTOR,
    mutationOrigin: "operator" as const,
    confirmationReference: REF,
    idempotencyKey: "idem-bfs3a-0001",
    pricingFingerprint: FP,
    ...overrides,
  };
}

describe("BFS-3a BookingCommercialAmendment domain", () => {
  it("validates and computes signed positive delta with 4dp money", () => {
    const amendment = BookingCommercialAmendment.create(validInput());
    expect(amendment.deltaAmount).toBe("150.0000");
    expect(amendment.currency).toBe("EUR");
    expect(amendment.previousTotalAmount).toBe("300.0000");
    expect(amendment.newTotalAmount).toBe("450.0000");
  });

  it("supports negative deltas", () => {
    const amendment = BookingCommercialAmendment.create(
      validInput({
        previousTotalAmount: "500.0000",
        newTotalAmount: "200.0000",
      }),
    );
    expect(amendment.deltaAmount).toBe("-300.0000");
  });

  it("rejects invalid currency codes (Money decimal path)", () => {
    expect(() =>
      BookingCommercialAmendment.create(validInput({ currency: "US" })),
    ).toThrow(ValidationError);
  });

  it("rejects invalid pricing intent", () => {
    expect(() =>
      BookingCommercialAmendment.create(
        validInput({ pricingIntent: "preserve_agreed_total" as never }),
      ),
    ).toThrow(/pricing intent/i);
  });

  it("rejects missing/short reason", () => {
    expect(() =>
      BookingCommercialAmendment.create(validInput({ reason: "ab" })),
    ).toThrow(/reason/i);
  });

  it("rejects same previous/new quote ids", () => {
    expect(() =>
      BookingCommercialAmendment.create(
        validInput({ previousQuoteId: Q1, newQuoteId: Q1 }),
      ),
    ).toThrow(/distinct/i);
  });

  it("matches idempotent payload exactly", () => {
    const a = BookingCommercialAmendment.create(validInput());
    const b = BookingCommercialAmendment.create(validInput({ id: "22222222-2222-4222-8222-222222222222" }));
    expect(a.matchesIdempotentPayload(b)).toBe(true);
    const c = BookingCommercialAmendment.create(
      validInput({
        id: "33333333-3333-4333-8333-333333333333",
        newTotalAmount: "999.0000",
      }),
    );
    expect(a.matchesIdempotentPayload(c)).toBe(false);
  });

  it("Policy A fails closed on non-zero fees/taxes", () => {
    expect(() =>
      assertCommercialFeeTaxPolicyA({
        feesAmount: "10.0000",
        taxesAmount: "0.0000",
        currency: "EUR",
      }),
    ).toThrow(COMMERCIAL_FEE_TAX_POLICY_A_MESSAGE);

    expect(() =>
      assertCommercialFeeTaxPolicyA({
        feesAmount: "0.0000",
        taxesAmount: "5.0000",
        currency: "EUR",
      }),
    ).toThrow(COMMERCIAL_FEE_TAX_POLICY_A_MESSAGE);

    expect(() =>
      assertCommercialFeeTaxPolicyA({
        feesAmount: "0.0000",
        taxesAmount: "0.0000",
        currency: "EUR",
      }),
    ).not.toThrow();
  });

  it("blocks automatic reprice for imported_csv and operator_entered", () => {
    expect(() =>
      assertPricingModeAllowsAutomaticRatePlanReprice("imported_csv"),
    ).toThrow(IMPORTED_OPERATOR_REPRICE_BLOCK_MESSAGE);
    expect(() =>
      assertPricingModeAllowsAutomaticRatePlanReprice("operator_entered"),
    ).toThrow(IMPORTED_OPERATOR_REPRICE_BLOCK_MESSAGE);
    expect(() =>
      assertPricingModeAllowsAutomaticRatePlanReprice("talos_calculated"),
    ).not.toThrow();
    expect(() =>
      assertPricingModeAllowsAutomaticRatePlanReprice(undefined),
    ).not.toThrow();
  });

  it("folio adjustment validation rejects closed and fiscal coverage; does not post", () => {
    const open = Folio.open({
      id: "44444444-4444-4444-8444-444444444444",
      tenantId: TENANT,
      bookingId: BOOKING,
      currency: "EUR",
    });
    open.appendPostedLine(
      FolioLine.createPosted({
        id: "55555555-5555-4555-8555-555555555555",
        tenantId: TENANT,
        folioId: open.id,
        lineType: "accommodation",
        description: "Night",
        amount: Money.create("100.0000", "EUR"),
        source: {
          sourceType: "quote_snapshot_night",
          sourceId: Q1,
          sourceLineRef: "snap:2025-08-01",
        },
        sortOrder: 0,
      }),
    );

    const draft = validateCommercialAmendmentFolioAdjustment({
      folio: open,
      deltaAmount: "50.0000",
      amendmentId: AMENDMENT,
      hasFiscalCoverageOnAccommodation: false,
    });
    expect(draft.deltaAmount).toBe("50.0000");
    expect(open.lines).toHaveLength(1);

    const spec = commercialAmendmentAdjustmentLineSpec(draft, "66666666-6666-4666-8666-666666666666");
    expect(spec.lineType).toBe("adjustment");
    expect(spec.source.sourceType).toBe("booking_commercial_amendment");
    expect(open.lines).toHaveLength(1);

    expect(() =>
      validateCommercialAmendmentFolioAdjustment({
        folio: open,
        deltaAmount: "50.0000",
        amendmentId: AMENDMENT,
        hasFiscalCoverageOnAccommodation: true,
      }),
    ).toThrow(COMMERCIAL_AMENDMENT_FISCAL_COVERAGE_MESSAGE);

    const closed = Folio.rehydrate(
      { ...open.toProps(), status: "closed" },
      [...open.lines],
    );
    expect(() =>
      validateCommercialAmendmentFolioAdjustment({
        folio: closed,
        deltaAmount: "50.0000",
        amendmentId: AMENDMENT,
        hasFiscalCoverageOnAccommodation: false,
      }),
    ).toThrow(COMMERCIAL_AMENDMENT_FOLIO_CLOSED_MESSAGE);
  });

  it("financial apply gate message remains the BFS-3 blocker", () => {
    expect(BFS3_FINANCIAL_APPLY_GATE_MESSAGE).toMatch(/BFS-3/);
  });
});
