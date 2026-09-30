import { describe, it, expect, vi } from "vitest";
import {
  GetDirectBookingCalendarUseCase,
  DIRECT_BOOKING_CALENDAR_MAX_RANGE_DAYS,
  projectNightlyPricesForRange,
  ForbiddenError,
  ValidationError,
  type DirectBookingCatalogSnapshot,
  type DirectBookingIntegrationPublicLookup,
  type RatePlanProps,
} from "../../src/index";

const activeCatalog = (): DirectBookingCatalogSnapshot => ({
  property: {
    id: "prop-1",
    tenantId: "tenant-1",
    name: "Pilot Villa",
    slug: "pilot-villa",
    type: "villa",
    status: "active",
    timezone: "Europe/Athens",
    deletedAt: null,
  },
  unit: {
    id: "unit-1",
    propertyId: "prop-1",
    name: "Entire Property",
    slug: "entire-property",
    status: "active",
    maxGuests: 4,
    bedrooms: 2,
    bathrooms: 1,
    deletedAt: null,
  },
  currency: "EUR",
  hasRatePlan: true,
  stayRules: {
    minNights: 3,
    maxNights: 30,
    checkInDays: [0, 1, 2, 3, 4, 5, 6],
    checkOutDays: [0, 1, 2, 3, 4, 5, 6],
    advanceMinDays: 0,
    advanceMaxDays: 365,
    turnoverNights: 0,
  },
});

const activeIntegration = (): DirectBookingIntegrationPublicLookup => ({
  id: "int-1",
  tenantId: "tenant-1",
  propertyId: "prop-1",
  unitId: "unit-1",
  environment: "live",
  allowedOrigins: ["https://example.com"],
  status: "active",
});

const baseRatePlan = (): RatePlanProps => ({
  baseNightlyAmount: "150.0000",
  currency: "EUR",
  seasons: [],
  dowModifiers: [],
  losDiscounts: [],
});

function buildUseCase(overrides?: {
  blocks?: Array<{
    blockType: string;
    status: string;
    checkIn: string;
    checkOut: string;
    sourceId: string | null;
  }>;
  rules?: Partial<NonNullable<DirectBookingCatalogSnapshot["stayRules"]>>;
  integration?: DirectBookingIntegrationPublicLookup;
  catalog?: DirectBookingCatalogSnapshot;
  today?: string;
  ratePlan?: RatePlanProps | null;
}) {
  const catalogSnap = overrides?.catalog ?? activeCatalog();
  const rules = {
    minNights: 3,
    maxNights: 30,
    checkInDays: [0, 1, 2, 3, 4, 5, 6],
    checkOutDays: [0, 1, 2, 3, 4, 5, 6],
    advanceMinDays: 0,
    advanceMaxDays: 365,
    turnoverNights: 0,
    ...(overrides?.rules ?? {}),
  };

  const useCase = new GetDirectBookingCalendarUseCase(
    { getCatalogSnapshot: vi.fn().mockResolvedValue(catalogSnap) } as never,
    {
      findActiveBlocks: vi.fn().mockResolvedValue(overrides?.blocks ?? []),
    } as never,
    {
      findByUnitId: vi.fn().mockResolvedValue(rules),
    } as never,
    {
      findByUnitId: vi.fn().mockResolvedValue(
        overrides?.ratePlan === undefined ? baseRatePlan() : overrides.ratePlan,
      ),
    } as never,
    {
      propertyLocalToday: vi.fn().mockResolvedValue(overrides?.today ?? "2026-09-30"),
    } as never,
  );

  return { useCase, integration: overrides?.integration ?? activeIntegration() };
}

describe("GetDirectBookingCalendarUseCase", () => {
  it("returns available nights with authoritative nightly prices", async () => {
    const { useCase, integration } = buildUseCase();
    const result = await useCase.execute(integration, {
      from: "2026-12-10",
      to: "2026-12-13",
      guestCount: 2,
    });
    expect(result.isSuccess).toBe(true);
    const dto = result.getValue();
    expect(dto.currency).toBe("EUR");
    expect(dto.minNights).toBe(3);
    expect(dto.maxGuests).toBe(4);
    expect(dto.days).toHaveLength(3);
    expect(dto.days.every((d) => d.available && d.nightlyPrice === "150.0000")).toBe(true);
    expect(JSON.stringify(dto)).not.toContain("tenant-1");
    expect(JSON.stringify(dto)).not.toContain("booking");
  });

  it("fails closed for draft integration", async () => {
    const { useCase } = buildUseCase({
      integration: { ...activeIntegration(), status: "draft" },
    });
    const result = await useCase.execute(
      { ...activeIntegration(), status: "draft" },
      { from: "2026-12-10", to: "2026-12-13", guestCount: 2 },
    );
    expect(result.isFailure).toBe(true);
    expect(result.getError()).toBeInstanceOf(ForbiddenError);
  });

  it("rejects excessive range", async () => {
    const { useCase, integration } = buildUseCase();
    const from = "2026-01-01";
    const toDate = new Date(Date.UTC(2026, 0, 1 + DIRECT_BOOKING_CALENDAR_MAX_RANGE_DAYS + 1));
    const to = toDate.toISOString().slice(0, 10);
    const result = await useCase.execute(integration, { from, to, guestCount: 2 });
    expect(result.isFailure).toBe(true);
    expect(result.getError()).toBeInstanceOf(ValidationError);
  });

  it("rejects invalid range and guest limit", async () => {
    const { useCase, integration } = buildUseCase();
    const badRange = await useCase.execute(integration, {
      from: "2026-12-13",
      to: "2026-12-10",
      guestCount: 2,
    });
    expect(badRange.isFailure).toBe(true);

    const badGuests = await useCase.execute(integration, {
      from: "2026-12-10",
      to: "2026-12-13",
      guestCount: 5,
    });
    expect(badGuests.isFailure).toBe(true);
  });

  it("marks blocked occupied nights unavailable with null price; preserves checkout morning", async () => {
    const { useCase, integration } = buildUseCase({
      blocks: [
        {
          blockType: "booking",
          status: "active",
          checkIn: "2026-12-10",
          checkOut: "2026-12-12",
          sourceId: "booking-1",
        },
      ],
    });
    const result = await useCase.execute(integration, {
      from: "2026-12-10",
      to: "2026-12-14",
      guestCount: 2,
    });
    expect(result.isSuccess).toBe(true);
    const byDate = Object.fromEntries(result.getValue().days.map((d) => [d.date, d]));
    // Occupied nights 10,11 — checkout morning 12 is NOT an occupied night of that stay
    expect(byDate["2026-12-10"]?.available).toBe(false);
    expect(byDate["2026-12-10"]?.nightlyPrice).toBeNull();
    expect(byDate["2026-12-11"]?.available).toBe(false);
    expect(byDate["2026-12-11"]?.nightlyPrice).toBeNull();
    expect(byDate["2026-12-12"]?.available).toBe(true);
    expect(byDate["2026-12-12"]?.nightlyPrice).toBe("150.0000");
    expect(JSON.stringify(result.getValue())).not.toContain("booking-1");
  });

  it("treats active holds as blocking inventory nights", async () => {
    const { useCase, integration } = buildUseCase({
      blocks: [
        {
          blockType: "hold",
          status: "active",
          checkIn: "2026-12-15",
          checkOut: "2026-12-17",
          sourceId: "hold-1",
        },
      ],
    });
    const result = await useCase.execute(integration, {
      from: "2026-12-15",
      to: "2026-12-18",
      guestCount: 2,
    });
    const byDate = Object.fromEntries(result.getValue().days.map((d) => [d.date, d]));
    expect(byDate["2026-12-15"]?.available).toBe(false);
    expect(byDate["2026-12-16"]?.available).toBe(false);
    expect(byDate["2026-12-17"]?.available).toBe(true);
  });

  it("maps CTA/CTD and advance window into check-in/out flags", async () => {
    const { useCase, integration } = buildUseCase({
      // Wednesday=3 only for check-in; Friday=5 only for check-out
      rules: {
        checkInDays: [3],
        checkOutDays: [5],
        advanceMinDays: 2,
        advanceMaxDays: 365,
      },
      today: "2026-09-30",
    });
    // 2026-12-09 = Wednesday, 2026-12-11 = Friday
    const result = await useCase.execute(integration, {
      from: "2026-12-09",
      to: "2026-12-12",
      guestCount: 2,
    });
    const byDate = Object.fromEntries(result.getValue().days.map((d) => [d.date, d]));
    expect(byDate["2026-12-09"]?.checkInAllowed).toBe(true);
    expect(byDate["2026-12-09"]?.checkOutAllowed).toBe(false);
    expect(byDate["2026-12-11"]?.checkInAllowed).toBe(false);
    expect(byDate["2026-12-11"]?.checkOutAllowed).toBe(true);

    // Too soon for advanceMinDays=2 when today=2026-09-30 → 2026-10-01 is 1 day ahead
    const soon = await useCase.execute(integration, {
      from: "2026-10-01",
      to: "2026-10-03",
      guestCount: 2,
    });
    expect(soon.getValue().days[0]?.checkInAllowed).toBe(false);
  });

  it("does not create hold/quote/booking side effects (repository write ports unused)", async () => {
    const findActiveBlocks = vi.fn().mockResolvedValue([]);
    const useCase = new GetDirectBookingCalendarUseCase(
      { getCatalogSnapshot: vi.fn().mockResolvedValue(activeCatalog()) } as never,
      { findActiveBlocks } as never,
      {
        findByUnitId: vi.fn().mockResolvedValue(activeCatalog().stayRules),
      } as never,
      { findByUnitId: vi.fn().mockResolvedValue(baseRatePlan()) } as never,
      { propertyLocalToday: vi.fn().mockResolvedValue("2026-09-30") } as never,
    );
    await useCase.execute(activeIntegration(), {
      from: "2026-12-10",
      to: "2026-12-13",
      guestCount: 2,
    });
    expect(findActiveBlocks).toHaveBeenCalledTimes(1);
  });
});

describe("projectNightlyPricesForRange", () => {
  it("uses PricingCalculator season/DOW nightly amounts without inventing totals", () => {
    const prices = projectNightlyPricesForRange(
      {
        ...baseRatePlan(),
        seasons: [
          {
            id: "s1",
            name: "Peak",
            startDate: "2026-12-11",
            endDate: "2026-12-11",
            nightlyAmount: "200.0000",
          },
        ],
      },
      "2026-12-10",
      "2026-12-12",
    );
    expect(prices.get("2026-12-10")).toBe("150.0000");
    expect(prices.get("2026-12-11")).toBe("200.0000");
  });
});
