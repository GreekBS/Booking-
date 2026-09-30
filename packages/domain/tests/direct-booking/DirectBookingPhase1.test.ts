import { describe, it, expect, vi } from "vitest";
import {
  evaluateDirectBookingPublishability,
  isIntegrationPubliclyEnabled,
  GetDirectBookingPublicConfigUseCase,
  CheckDirectBookingAvailabilityUseCase,
  QuoteDirectBookingStayUseCase,
  Result,
  ForbiddenError,
  ValidationError,
  type DirectBookingCatalogSnapshot,
  type DirectBookingIntegrationPublicLookup,
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
    minNights: 2,
    maxNights: 14,
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

describe("Direct Booking publishability", () => {
  it("treats only active integrations as publicly enabled", () => {
    expect(isIntegrationPubliclyEnabled("active")).toBe(true);
    expect(isIntegrationPubliclyEnabled("draft")).toBe(false);
    expect(isIntegrationPubliclyEnabled("disabled")).toBe(false);
  });

  it("fails closed for draft property even with active integration", () => {
    const catalog = activeCatalog();
    catalog.property.status = "draft";
    const result = evaluateDirectBookingPublishability(activeIntegration(), catalog, {
      requireRatePlan: true,
    });
    expect(result.bookable).toBe(false);
    expect(result.reasons).toContain("property_not_active");
  });

  it("fails closed when rate plan is required but missing", () => {
    const catalog = activeCatalog();
    catalog.hasRatePlan = false;
    const result = evaluateDirectBookingPublishability(activeIntegration(), catalog, {
      requireRatePlan: true,
    });
    expect(result.bookable).toBe(false);
    expect(result.reasons).toContain("rate_plan_missing");
  });

  it("is bookable when integration, inventory, and rates are ready", () => {
    const result = evaluateDirectBookingPublishability(
      activeIntegration(),
      activeCatalog(),
      { requireRatePlan: true },
    );
    expect(result).toEqual({ bookable: true, reasons: [] });
  });
});

describe("GetDirectBookingPublicConfigUseCase", () => {
  it("resolves public config without tenant/property ids", async () => {
    const catalog = {
      getCatalogSnapshot: vi.fn().mockResolvedValue(activeCatalog()),
    };
    const integrations = {
      findByPublicKeyHash: vi.fn(),
    };
    const useCase = new GetDirectBookingPublicConfigUseCase(
      integrations as never,
      catalog as never,
    );

    const result = await useCase.execute(activeIntegration());
    expect(result.isSuccess).toBe(true);
    const dto = result.getValue();
    expect(dto.property.name).toBe("Pilot Villa");
    expect(dto.bookable).toBe(true);
    expect(JSON.stringify(dto)).not.toContain("tenant-1");
    expect(JSON.stringify(dto)).not.toContain("prop-1");
  });

  it("fails closed for draft/disabled integration", async () => {
    const useCase = new GetDirectBookingPublicConfigUseCase(
      { findByPublicKeyHash: vi.fn() } as never,
      { getCatalogSnapshot: vi.fn() } as never,
    );
    const draft = { ...activeIntegration(), status: "draft" as const };
    const result = await useCase.execute(draft);
    expect(result.isFailure).toBe(true);
    expect(result.getError()).toBeInstanceOf(ForbiddenError);
  });

  it("fails closed for draft property (no public leak)", async () => {
    const catalog = activeCatalog();
    catalog.property.status = "draft";
    const useCase = new GetDirectBookingPublicConfigUseCase(
      { findByPublicKeyHash: vi.fn() } as never,
      { getCatalogSnapshot: vi.fn().mockResolvedValue(catalog) } as never,
    );
    const result = await useCase.execute(activeIntegration());
    expect(result.isFailure).toBe(true);
  });
});

describe("CheckDirectBookingAvailabilityUseCase", () => {
  it("delegates to orchestrator inventory authority", async () => {
    const evaluateAvailability = vi.fn().mockResolvedValue(
      Result.ok({
        available: false,
        reasons: [{ code: "DATE_BLOCKED", message: "blocked" }],
        nights: [
          { date: "2026-10-01", available: false },
          { date: "2026-10-02", available: false },
        ],
      }),
    );
    const useCase = new CheckDirectBookingAvailabilityUseCase(
      { getCatalogSnapshot: vi.fn().mockResolvedValue(activeCatalog()) } as never,
      { evaluateAvailability } as never,
    );

    const result = await useCase.execute(activeIntegration(), {
      checkIn: "2026-10-01",
      checkOut: "2026-10-03",
      guestCount: 2,
    });

    expect(result.isSuccess).toBe(true);
    expect(result.getValue().available).toBe(false);
    expect(result.getValue().reasonCodes).toEqual(["DATE_BLOCKED"]);
    expect(evaluateAvailability).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      unitId: "unit-1",
      checkIn: "2026-10-01",
      checkOut: "2026-10-03",
      guestCount: 2,
    });
  });

  it("fails closed for draft property", async () => {
    const catalog = activeCatalog();
    catalog.property.status = "draft";
    const evaluateAvailability = vi.fn();
    const useCase = new CheckDirectBookingAvailabilityUseCase(
      { getCatalogSnapshot: vi.fn().mockResolvedValue(catalog) } as never,
      { evaluateAvailability } as never,
    );
    const result = await useCase.execute(activeIntegration(), {
      checkIn: "2026-10-01",
      checkOut: "2026-10-03",
      guestCount: 2,
    });
    expect(result.isFailure).toBe(true);
    expect(evaluateAvailability).not.toHaveBeenCalled();
  });
});

describe("QuoteDirectBookingStayUseCase", () => {
  it("prices via orchestrator and ignores client price fields by contract", async () => {
    const Money = (await import("../../src/commerce/shared/value-objects/Money")).Money;
    const evaluateAvailability = vi.fn().mockResolvedValue(
      Result.ok({
        available: true,
        reasons: [],
        nights: [{ date: "2026-10-01", available: true }],
      }),
    );
    const priceStay = vi.fn().mockResolvedValue(
      Result.ok({
        lineItems: [
          { date: "2026-10-01", baseAmount: "100.00", adjustedAmount: "100.00", currency: "EUR" },
        ],
        subtotal: Money.create("100.00", "EUR"),
        losDiscountAmount: Money.zero("EUR"),
        total: Money.create("100.00", "EUR"),
        currency: "EUR",
        quotedAt: new Date("2026-09-30T12:00:00.000Z"),
      }),
    );

    const useCase = new QuoteDirectBookingStayUseCase(
      { getCatalogSnapshot: vi.fn().mockResolvedValue(activeCatalog()) } as never,
      { evaluateAvailability, priceStay } as never,
    );

    const result = await useCase.execute(activeIntegration(), {
      checkIn: "2026-10-01",
      checkOut: "2026-10-02",
      guestCount: 2,
    });

    expect(result.isSuccess).toBe(true);
    expect(result.getValue().total).toBe("100.0000");
    expect(priceStay).toHaveBeenCalledWith(
      "tenant-1",
      "unit-1",
      "2026-10-01",
      "2026-10-02",
    );
  });

  it("enforces guest limit from catalog", async () => {
    const useCase = new QuoteDirectBookingStayUseCase(
      { getCatalogSnapshot: vi.fn().mockResolvedValue(activeCatalog()) } as never,
      { evaluateAvailability: vi.fn(), priceStay: vi.fn() } as never,
    );
    const result = await useCase.execute(activeIntegration(), {
      checkIn: "2026-10-01",
      checkOut: "2026-10-02",
      guestCount: 99,
    });
    expect(result.isFailure).toBe(true);
    expect(result.getError()).toBeInstanceOf(ValidationError);
  });

  it("does not create hold/booking side effects (orchestrator methods only)", async () => {
    const Money = (await import("../../src/commerce/shared/value-objects/Money")).Money;
    const orchestrator = {
      evaluateAvailability: vi.fn().mockResolvedValue(
        Result.ok({ available: true, reasons: [], nights: [{ date: "2026-10-01", available: true }] }),
      ),
      priceStay: vi.fn().mockResolvedValue(
        Result.ok({
          lineItems: [
            { date: "2026-10-01", baseAmount: "50.00", adjustedAmount: "50.00", currency: "EUR" },
          ],
          subtotal: Money.create("50.00", "EUR"),
          losDiscountAmount: Money.zero("EUR"),
          total: Money.create("50.00", "EUR"),
          currency: "EUR",
          quotedAt: new Date(),
        }),
      ),
      createHold: vi.fn(),
      createQuote: vi.fn(),
      createBooking: vi.fn(),
    };
    const useCase = new QuoteDirectBookingStayUseCase(
      { getCatalogSnapshot: vi.fn().mockResolvedValue(activeCatalog()) } as never,
      orchestrator as never,
    );
    await useCase.execute(activeIntegration(), {
      checkIn: "2026-10-01",
      checkOut: "2026-10-02",
      guestCount: 1,
    });
    expect(orchestrator.createHold).not.toHaveBeenCalled();
    expect(orchestrator.createQuote).not.toHaveBeenCalled();
    expect(orchestrator.createBooking).not.toHaveBeenCalled();
  });
});
