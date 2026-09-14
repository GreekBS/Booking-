import { describe, it, expect } from "vitest";
import { PricingCalculator } from "../../src/commerce/pricing/PricingCalculator";
import { StayPeriod } from "../../src/commerce/shared/value-objects/StayPeriod";
import {
  baseRatePlan,
  highSeasonRatePlan,
  weekendModifierRatePlan,
  QUOTED_AT,
} from "./fixtures/commerceFixtures";

describe("PricingCalculator", () => {
  const calculator = new PricingCalculator();

  it("prices nights with base rate", () => {
    const stay = StayPeriod.create("2025-06-10", "2025-06-12");
    const result = calculator.calculate(baseRatePlan, stay, QUOTED_AT);
    expect(result.lineItems).toHaveLength(2);
    expect(result.subtotal.amount).toBe("200.0000");
    expect(result.total.amount).toBe("200.0000");
  });

  it("applies high season override", () => {
    const stay = StayPeriod.create("2025-07-20", "2025-07-22");
    const result = calculator.calculate(highSeasonRatePlan, stay, QUOTED_AT);
    expect(result.lineItems[0].baseAmount).toBe("180.0000");
    expect(result.subtotal.amount).toBe("360.0000");
  });

  it("uses first matching season when ranges overlap", () => {
    const overlappingPlan = {
      ...baseRatePlan,
      seasons: [
        {
          id: "season-a",
          name: "A",
          startDate: "2025-07-01",
          endDate: "2025-07-31",
          nightlyAmount: "150.0000",
        },
        {
          id: "season-b",
          name: "B",
          startDate: "2025-07-15",
          endDate: "2025-08-15",
          nightlyAmount: "200.0000",
        },
      ],
    };
    const stay = StayPeriod.create("2025-07-20", "2025-07-21");
    const result = calculator.calculate(overlappingPlan, stay, QUOTED_AT);
    expect(result.lineItems[0].baseAmount).toBe("150.0000");
  });

  it("applies day-of-week modifiers", () => {
    const stay = StayPeriod.create("2025-06-06", "2025-06-08");
    const result = calculator.calculate(weekendModifierRatePlan, stay, QUOTED_AT);
    expect(result.lineItems[0].adjustedAmount).toBe("120.0000");
    expect(result.lineItems[1].adjustedAmount).toBe("130.0000");
  });

  it("applies length-of-stay discount on highest qualifying tier", () => {
    const plan = {
      ...weekendModifierRatePlan,
      dowModifiers: [],
      losDiscounts: [
        { minNights: 7, percentOff: "10.0000" },
        { minNights: 14, percentOff: "15.0000" },
      ],
    };
    const stay = StayPeriod.create("2025-06-01", "2025-06-15");
    const result = calculator.calculate(plan, stay, QUOTED_AT);
    expect(result.losDiscountAmount.amount).toBe("210.0000");
    expect(result.total.amount).toBe("1190.0000");
  });
});
