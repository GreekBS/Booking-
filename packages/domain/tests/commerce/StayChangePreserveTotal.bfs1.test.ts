import { describe, expect, it, vi } from "vitest";
import {
  Booking,
  ChangeBookingStayUseCase,
  Hold,
  Money,
  PermissionChecker,
  Quote,
  Result,
  ValidationError,
} from "../../src/index";
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

const admin = {
  userId: "admin-bfs1",
  tenantId: TENANT,
  role: "admin" as const,
  propertyIds: null,
};

function makeBooking(opts?: {
  pricingMode?: "talos_calculated" | "imported_csv" | "operator_entered";
  total?: string;
  guestCount?: number;
}) {
  const hold = createHoldForUnit(UNIT, PROP, "2025-08-01", "2025-08-04", {
    now: HOLD_CREATED_AT,
    guestCount: opts?.guestCount ?? 2,
  });

  let quote: Quote;
  if (opts?.pricingMode === "imported_csv" || opts?.pricingMode === "operator_entered") {
    quote = Quote.createFromFixedTotal({
      id: "quote-fixed-1",
      snapshotId: "snap-fixed-1",
      hold,
      propertyTimezone: villaProperty.timezone,
      total: Money.create(opts.total ?? "444.5000", "EUR"),
      pricingMode: opts.pricingMode,
      quotedAt: NOW,
    });
  } else if (opts?.total) {
    quote = Quote.createFromFixedTotal({
      id: "quote-frozen-1",
      snapshotId: "snap-frozen-1",
      hold,
      propertyTimezone: villaProperty.timezone,
      total: Money.create(opts.total, "EUR"),
      pricingMode: "talos_calculated",
      quotedAt: NOW,
    });
  } else {
    const pricing = new PricingCalculator().calculate(
      baseRatePlan,
      hold.stayPeriod,
      NOW,
    );
    quote = Quote.create({
      id: "quote-1",
      snapshotId: "snap-1",
      hold,
      pricing,
      propertyTimezone: villaProperty.timezone,
    });
  }

  const booking = Booking.create({
    id: "booking-1",
    hold,
    quote,
    guest: { name: "BFS Guest", email: "bfs@test.com", phone: null },
    confirmationMode: "manual",
    now: NOW,
  });

  return { booking, quote, hold };
}

function buildEngine() {
  const priceStay = vi.fn(async () => {
    const quotedAt = new Date();
    const pricing = new PricingCalculator().calculate(
      { ...baseRatePlan, baseNightlyAmount: "999.0000" },
      Hold.create({
        id: "tmp-hold",
        tenantId: TENANT,
        unitId: UNIT,
        propertyId: PROP,
        checkIn: "2025-08-01",
        checkOut: "2025-08-10",
        guestCount: 2,
        now: quotedAt,
      }).stayPeriod,
      quotedAt,
    );
    return Result.ok(pricing);
  });

  const availabilityEngine = {
    evaluate: vi.fn(async () =>
      Result.ok({
        available: true,
        reasons: [],
        propertyId: PROP,
      }),
    ),
  };

  const catalog = {
    getProperty: vi.fn(async () => villaProperty),
  };

  let n = 0;
  const idGenerator = {
    generate: () => {
      n += 1;
      return `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
    },
  };

  const engine = new StayMutationEngine(
    availabilityEngine as never,
    { priceStay } as never,
    new QuoteFactory(),
    catalog as never,
    idGenerator,
  );

  return { engine, priceStay, availabilityEngine };
}

describe("BFS-1 stay-change preserve_agreed_total", () => {
  it("guest-count-only change preserves agreed total and pricingMode", async () => {
    const { booking, quote } = makeBooking({
      pricingMode: "imported_csv",
      total: "444.5000",
    });
    const { engine, priceStay } = buildEngine();

    const result = await engine.commitStayChange(
      booking,
      {
        unitId: UNIT,
        checkIn: "2025-08-01",
        checkOut: "2025-08-04",
        guestCount: 4,
      },
      quote,
      { commercial: { source: "operator", pricingIntent: "preserve_agreed_total" } },
    );

    expect(result.isSuccess).toBe(true);
    expect(result.getValue().quote.snapshot.totalAmount).toBe("444.5000");
    expect(result.getValue().quote.snapshot.pricingMode).toBe("imported_csv");
    expect(result.getValue().booking.guestCount.value).toBe(4);
    expect(priceStay).not.toHaveBeenCalled();
  });

  it("unit and date changes preserve agreed total and commercial components", async () => {
    const { booking, quote } = makeBooking({
      pricingMode: "operator_entered",
      total: "600.0000",
    });
    const { engine, priceStay } = buildEngine();

    const result = await engine.commitStayChange(
      booking,
      {
        unitId: UNIT,
        checkIn: "2025-08-02",
        checkOut: "2025-08-09",
        guestCount: 2,
      },
      quote,
      { commercial: { source: "operator" } },
    );

    expect(result.isSuccess).toBe(true);
    const next = result.getValue().quote.snapshot;
    expect(next.totalAmount).toBe("600.0000");
    expect(next.pricingMode).toBe("operator_entered");
    expect(next.feesAmount).toBe(quote.snapshot.feesAmount);
    expect(next.taxesAmount).toBe(quote.snapshot.taxesAmount);
    expect(next.subtotalAmount).toBe(quote.snapshot.subtotalAmount);
    expect(next.checkIn).toBe("2025-08-02");
    expect(next.checkOut).toBe("2025-08-09");
    expect(next.preservedCommercialEvidence?.reason).toBe("stay_geometry_changed");
    expect(next.preservedCommercialEvidence?.lineItems).toEqual(
      quote.snapshot.lineItems,
    );
    expect(priceStay).not.toHaveBeenCalled();
  });

  it("preview shows zero financial delta under preserve", async () => {
    const { booking, quote } = makeBooking({ total: "300.0000" });
    const { engine } = buildEngine();

    const preview = await engine.previewStayChange(
      booking,
      {
        unitId: UNIT,
        checkIn: "2025-08-01",
        checkOut: "2025-08-10",
        guestCount: 2,
      },
      quote,
      { source: "operator" },
    );

    expect(preview.isSuccess).toBe(true);
    expect(preview.getValue().proposed?.totalAmount).toBe(quote.snapshot.totalAmount);
    expect(preview.getValue().priceDelta?.amount).toBe("0.0000");
    expect(preview.getValue().pricingIntent).toBe("preserve_agreed_total");
  });

  it("rejects recalculate_from_rate_plan until BFS-2", async () => {
    const { booking, quote } = makeBooking();
    const { engine, priceStay } = buildEngine();

    const result = await engine.commitStayChange(
      booking,
      {
        unitId: UNIT,
        checkIn: "2025-08-01",
        checkOut: "2025-08-05",
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

    expect(result.isFailure).toBe(true);
    expect(result.getError()).toBeInstanceOf(ValidationError);
    expect(result.getError().message).toMatch(/BFS-2/);
    expect(priceStay).not.toHaveBeenCalled();
  });

  it("rejects manual_total on stay change", async () => {
    const { booking, quote } = makeBooking();
    const { engine } = buildEngine();

    const result = await engine.commitStayChange(
      booking,
      {
        unitId: UNIT,
        checkIn: "2025-08-01",
        checkOut: "2025-08-05",
        guestCount: 2,
      },
      quote,
      { commercial: { source: "operator", pricingIntent: "manual_total" } },
    );

    expect(result.isFailure).toBe(true);
    expect(result.getError().message).toMatch(/manual_total/);
  });

  it("channel_compat_reprice still invokes RatePlan pricing", async () => {
    const { booking, quote } = makeBooking({ total: "300.0000" });
    const { engine, priceStay } = buildEngine();

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

  it("ChangeBookingStayUseCase audits amounts and intent atomically", async () => {
    const { booking, quote } = makeBooking({
      pricingMode: "imported_csv",
      total: "500.0000",
    });
    booking.confirm(NOW);

    const audits: unknown[] = [];
    const commerceFlowRepository = {
      runInTenantTransaction: vi.fn(async (_t: string, fn: () => Promise<void>) => fn()),
      saveStayChange: vi.fn(async () => undefined),
    };
    const auditLogRepository = {
      append: vi.fn(async (entry: unknown) => {
        audits.push(entry);
      }),
    };

    const { engine } = buildEngine();
    const useCase = new ChangeBookingStayUseCase(
      { findById: vi.fn(async () => booking) } as never,
      { findById: vi.fn(async () => quote) } as never,
      commerceFlowRepository as never,
      {
        commitStayChange: (
          b: Booking,
          draft: Parameters<StayMutationEngine["commitStayChange"]>[1],
          q: Quote,
          options?: Parameters<StayMutationEngine["commitStayChange"]>[3],
        ) => engine.commitStayChange(b, draft, q, options),
      } as never,
      new PermissionChecker(),
      auditLogRepository,
    );

    const result = await useCase.execute(
      {
        tenantId: TENANT,
        bookingId: booking.id,
        unitId: UNIT,
        checkIn: "2025-08-01",
        checkOut: "2025-08-08",
        guestCount: 2,
      },
      admin,
    );

    expect(result.isSuccess).toBe(true);
    expect(commerceFlowRepository.runInTenantTransaction).toHaveBeenCalled();
    expect(commerceFlowRepository.saveStayChange).toHaveBeenCalled();
    expect(audits).toHaveLength(1);
    const meta = (audits[0] as { metadata: Record<string, unknown> }).metadata;
    expect(meta.pricingIntent).toBe("preserve_agreed_total");
    expect(meta.previousTotalAmount).toBe("500.0000");
    expect(meta.newTotalAmount).toBe("500.0000");
    expect(meta.financialDelta).toBe("0.0000");
    expect(meta.previousQuoteId).toBe(quote.id);
    expect(meta.newQuoteId).toBeTruthy();
  });

  it("fails when audit persistence fails inside the tenant transaction wrapper", async () => {
    const { booking, quote } = makeBooking({ total: "200.0000" });
    booking.confirm(NOW);

    const commerceFlowRepository = {
      runInTenantTransaction: vi.fn(async (_t: string, fn: () => Promise<void>) => fn()),
      saveStayChange: vi.fn(async () => undefined),
    };
    const { engine } = buildEngine();
    const useCase = new ChangeBookingStayUseCase(
      { findById: vi.fn(async () => booking) } as never,
      { findById: vi.fn(async () => quote) } as never,
      commerceFlowRepository as never,
      {
        commitStayChange: (
          b: Booking,
          draft: Parameters<StayMutationEngine["commitStayChange"]>[1],
          q: Quote,
          options?: Parameters<StayMutationEngine["commitStayChange"]>[3],
        ) => engine.commitStayChange(b, draft, q, options),
      } as never,
      new PermissionChecker(),
      {
        append: vi.fn(async () => {
          throw new Error("audit write failed");
        }),
      },
    );

    const result = await useCase.execute(
      {
        tenantId: TENANT,
        bookingId: booking.id,
        unitId: UNIT,
        checkIn: "2025-08-01",
        checkOut: "2025-08-06",
        guestCount: 2,
      },
      admin,
    );

    expect(result.isFailure).toBe(true);
    expect(result.getError().message).toMatch(/audit write failed/);
  });
});
