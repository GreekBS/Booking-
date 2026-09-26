import { describe, it, expect, vi, beforeEach } from "vitest";
import { PreviewStayPricingUseCase } from "../../src/commerce/application/PreviewStayPricingUseCase";
import { PermissionChecker } from "../../src/shared/services/PermissionChecker";
import type { ActorContext } from "../../src/shared/services/PermissionChecker";
import { ForbiddenError } from "../../src/shared/errors/DomainError";
import { Money } from "../../src/commerce/shared/value-objects/Money";
import { Result } from "../../src/shared/kernel/Result";
import type { PricingResult } from "../../src/commerce/pricing/PricingCalculator";

const TENANT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const UNIT_ID = "11111111-1111-4111-8111-111111111111";
const PROP_ID = "44444444-4444-4444-8444-444444444444";

function samplePricingResult(): PricingResult {
  const currency = "EUR";
  return {
    lineItems: [
      {
        date: "2026-08-01",
        baseAmount: "100.0000",
        adjustedAmount: "100.0000",
        currency,
      },
    ],
    subtotal: Money.create("100.0000", currency),
    losDiscountAmount: Money.zero(currency),
    total: Money.create("100.0000", currency),
    currency,
    quotedAt: new Date("2026-06-01T12:00:00.000Z"),
  };
}

describe("PreviewStayPricingUseCase", () => {
  const permissionChecker = new PermissionChecker();

  const getUnit = vi.fn();
  const getProperty = vi.fn();
  const catalog = {
    getUnit,
    getProperty,
  };

  const priceStay = vi.fn();
  const createHold = vi.fn();
  const createQuote = vi.fn();
  const orchestrator = {
    priceStay,
    createHold,
    createQuote,
  };

  const useCase = new PreviewStayPricingUseCase(
    catalog as never,
    orchestrator as never,
    permissionChecker,
  );

  const adminActor: ActorContext = {
    userId: "admin-1",
    role: "admin",
    propertyIds: null,
    isSuperAdmin: false,
  };

  const pricing = samplePricingResult();

  beforeEach(() => {
    getUnit.mockReset();
    getProperty.mockReset();
    priceStay.mockReset();
    createHold.mockReset();
    createQuote.mockReset();

    getUnit.mockResolvedValue({
      id: UNIT_ID,
      tenantId: TENANT_ID,
      propertyId: PROP_ID,
      maxGuests: 4,
      status: "active",
    });
    getProperty.mockResolvedValue({
      id: PROP_ID,
      tenantId: TENANT_ID,
      timezone: "Europe/Athens",
      status: "active",
    });
    priceStay.mockResolvedValue(Result.ok(pricing));
  });

  it("returns PricingResult for actor with PRICING_READ via PermissionChecker", async () => {
    const result = await useCase.execute(
      {
        tenantId: TENANT_ID,
        unitId: UNIT_ID,
        checkIn: "2026-08-01",
        checkOut: "2026-08-05",
        guestCount: 2,
      },
      adminActor,
    );

    expect(result.isSuccess).toBe(true);
    expect(result.getValue()).toEqual(pricing);
    expect(getUnit).toHaveBeenCalledWith(UNIT_ID, TENANT_ID);
    expect(getProperty).toHaveBeenCalledWith(PROP_ID, TENANT_ID);
    expect(priceStay).toHaveBeenCalledTimes(1);
    expect(priceStay).toHaveBeenCalledWith(
      TENANT_ID,
      UNIT_ID,
      "2026-08-01",
      "2026-08-05",
    );
  });

  it("only calls priceStay — never hold or quote paths", async () => {
    await useCase.execute(
      {
        tenantId: TENANT_ID,
        unitId: UNIT_ID,
        checkIn: "2026-08-01",
        checkOut: "2026-08-05",
      },
      adminActor,
    );

    expect(priceStay).toHaveBeenCalledTimes(1);
    expect(createHold).not.toHaveBeenCalled();
    expect(createQuote).not.toHaveBeenCalled();
  });

  it("forbids actor without pricing read permission", async () => {
    const noPricingRead: ActorContext = {
      userId: "manager-1",
      role: "manager",
      propertyIds: [PROP_ID],
      isSuperAdmin: false,
    };

    const result = await useCase.execute(
      {
        tenantId: TENANT_ID,
        unitId: UNIT_ID,
        checkIn: "2026-08-01",
        checkOut: "2026-08-05",
      },
      noPricingRead,
    );

    expect(result.isFailure).toBe(true);
    expect(result.getError()).toBeInstanceOf(ForbiddenError);
    expect(priceStay).not.toHaveBeenCalled();
  });
});
