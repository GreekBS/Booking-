import { describe, expect, it } from "vitest";
import { PricingCalculator } from "../../src/commerce/pricing/PricingCalculator";
import {
  UnsupportedRatePlanTemplateError,
  assertPricedRatePlan,
  cloneRatePlanProps,
} from "../../src/commerce/pricing/ratePlanTemplate";
import { StayPeriod } from "../../src/commerce/shared/value-objects/StayPeriod";
import type { RatePlanProps } from "../../src/commerce/shared/types/CommerceTypes";
import {
  baseRatePlan,
  highSeasonRatePlan,
  weekendModifierRatePlan,
  QUOTED_AT,
} from "./fixtures/commerceFixtures";

function sequentialIds(prefix = "id") {
  let n = 0;
  return {
    generate: () => {
      n += 1;
      return `${prefix}-${String(n).padStart(4, "0")}`;
    },
  };
}

const fullTemplate: RatePlanProps = {
  baseNightlyAmount: "120.0000",
  currency: "eur",
  seasons: [
    {
      id: "season-source-1",
      name: " Peak ",
      startDate: "2025-07-01",
      endDate: "2025-08-31",
      nightlyAmount: "200.0000",
    },
  ],
  dowModifiers: [
    { dayOfWeek: 5, modifierType: "percent", modifierValue: "10.0000" },
    { dayOfWeek: 6, modifierType: "fixed", modifierValue: "25.0000" },
  ],
  losDiscounts: [],
};

describe("assertPricedRatePlan C3-H2a", () => {
  it("accepts a valid positive RatePlan and normalizes currency", () => {
    const result = assertPricedRatePlan(fullTemplate);
    expect(result.isSuccess).toBe(true);
    expect(result.getValue().currency).toBe("EUR");
    expect(result.getValue().baseNightlyAmount).toBe("120.0000");
    expect(result.getValue().seasons[0]?.name).toBe("Peak");
  });

  it("rejects null / missing plan", () => {
    expect(assertPricedRatePlan(null).isFailure).toBe(true);
    expect(assertPricedRatePlan(undefined).isFailure).toBe(true);
  });

  it("rejects zero and negative base prices", () => {
    expect(
      assertPricedRatePlan({ ...baseRatePlan, baseNightlyAmount: "0.0000" })
        .isFailure,
    ).toBe(true);
    expect(
      assertPricedRatePlan({ ...baseRatePlan, baseNightlyAmount: "-10.0000" })
        .isFailure,
    ).toBe(true);
  });

  it("rejects zero seasonal prices and inverted date ranges", () => {
    const zeroSeason = assertPricedRatePlan({
      ...baseRatePlan,
      seasons: [
        {
          id: "s1",
          name: "Bad",
          startDate: "2025-07-01",
          endDate: "2025-07-31",
          nightlyAmount: "0.0000",
        },
      ],
    });
    expect(zeroSeason.isFailure).toBe(true);

    const inverted = assertPricedRatePlan({
      ...baseRatePlan,
      seasons: [
        {
          id: "s1",
          name: "Bad",
          startDate: "2025-08-01",
          endDate: "2025-07-01",
          nightlyAmount: "150.0000",
        },
      ],
    });
    expect(inverted.isFailure).toBe(true);
  });

  it("rejects malformed day-of-week modifiers", () => {
    expect(
      assertPricedRatePlan({
        ...baseRatePlan,
        dowModifiers: [
          {
            dayOfWeek: 7,
            modifierType: "percent",
            modifierValue: "10.0000",
          },
        ],
      }).isFailure,
    ).toBe(true);

    expect(
      assertPricedRatePlan({
        ...baseRatePlan,
        dowModifiers: [
          {
            dayOfWeek: 5,
            modifierType: "percent",
            modifierValue: "10.0000",
          },
          {
            dayOfWeek: 5,
            modifierType: "fixed",
            modifierValue: "5.0000",
          },
        ],
      }).isFailure,
    ).toBe(true);
  });

  it("rejects invalid currency", () => {
    expect(
      assertPricedRatePlan({ ...baseRatePlan, currency: "EURO" }).isFailure,
    ).toBe(true);
  });

  it("fail-closes on non-empty LOS discounts (unsupported for templates)", () => {
    const result = assertPricedRatePlan({
      ...baseRatePlan,
      losDiscounts: [{ minNights: 7, percentOff: "10.0000" }],
    });
    expect(result.isFailure).toBe(true);
    expect(result.getError()).toBeInstanceOf(UnsupportedRatePlanTemplateError);
    expect(result.getError().message).toMatch(/length-of-stay/i);
  });
});

describe("cloneRatePlanProps C3-H2a", () => {
  it("clones seasons and DOW modifiers with new season identities", () => {
    const result = cloneRatePlanProps(fullTemplate, sequentialIds("season"));
    expect(result.isSuccess).toBe(true);
    const clone = result.getValue();

    expect(clone.baseNightlyAmount).toBe("120.0000");
    expect(clone.currency).toBe("EUR");
    expect(clone.seasons).toHaveLength(1);
    expect(clone.seasons[0]?.id).toBe("season-0001");
    expect(clone.seasons[0]?.id).not.toBe(fullTemplate.seasons[0]?.id);
    expect(clone.seasons[0]?.nightlyAmount).toBe("200.0000");
    expect(clone.dowModifiers).toEqual([
      { dayOfWeek: 5, modifierType: "percent", modifierValue: "10.0000" },
      { dayOfWeek: 6, modifierType: "fixed", modifierValue: "25.0000" },
    ]);
    expect(clone.losDiscounts).toEqual([]);
  });

  it("does not mutate the source RatePlan", () => {
    const source: RatePlanProps = {
      ...highSeasonRatePlan,
      seasons: highSeasonRatePlan.seasons.map((s) => ({ ...s })),
      dowModifiers: [],
      losDiscounts: [],
    };
    const sourceSeasonId = source.seasons[0]!.id;

    const result = cloneRatePlanProps(source, sequentialIds());
    expect(result.isSuccess).toBe(true);
    const clone = result.getValue();

    clone.baseNightlyAmount = "999.0000";
    clone.seasons[0]!.name = "Mutated";
    clone.seasons[0]!.nightlyAmount = "1.0000";
    clone.dowModifiers.push({
      dayOfWeek: 0,
      modifierType: "fixed",
      modifierValue: "1.0000",
    });

    expect(source.baseNightlyAmount).toBe(highSeasonRatePlan.baseNightlyAmount);
    expect(source.seasons[0]?.id).toBe(sourceSeasonId);
    expect(source.seasons[0]?.name).toBe("High Season");
    expect(source.dowModifiers).toHaveLength(0);
  });

  it("source and clone do not share array references", () => {
    const result = cloneRatePlanProps(fullTemplate, sequentialIds());
    const clone = result.getValue();
    expect(clone.seasons).not.toBe(fullTemplate.seasons);
    expect(clone.dowModifiers).not.toBe(fullTemplate.dowModifiers);
    expect(clone.seasons[0]).not.toBe(fullTemplate.seasons[0]);
  });

  it("rejects unsupported LOS templates on clone", () => {
    const result = cloneRatePlanProps(
      {
        ...weekendModifierRatePlan,
        losDiscounts: [{ minNights: 7, percentOff: "10.0000" }],
      },
      sequentialIds(),
    );
    expect(result.isFailure).toBe(true);
    expect(result.getError()).toBeInstanceOf(UnsupportedRatePlanTemplateError);
  });

  it("cloned plan remains compatible with PricingCalculator", () => {
    // Fixture includes LOS — strip for template clone (LOS not persistable).
    const pricedDowOnly: RatePlanProps = {
      ...weekendModifierRatePlan,
      losDiscounts: [],
    };
    const cloned = cloneRatePlanProps(pricedDowOnly, sequentialIds()).getValue();
    const calculator = new PricingCalculator();
    const stay = StayPeriod.create("2025-06-06", "2025-06-08");
    const original = calculator.calculate(pricedDowOnly, stay, QUOTED_AT);
    const fromClone = calculator.calculate(cloned, stay, QUOTED_AT);
    expect(fromClone.total.amount).toBe(original.total.amount);
    expect(fromClone.lineItems.map((l) => l.adjustedAmount)).toEqual(
      original.lineItems.map((l) => l.adjustedAmount),
    );
  });

  it("cloned high-season plan preserves seasonal pricing", () => {
    const cloned = cloneRatePlanProps(
      highSeasonRatePlan,
      sequentialIds(),
    ).getValue();
    const calculator = new PricingCalculator();
    const stay = StayPeriod.create("2025-07-20", "2025-07-22");
    const result = calculator.calculate(cloned, stay, QUOTED_AT);
    expect(result.lineItems[0]?.baseAmount).toBe("180.0000");
    expect(result.subtotal.amount).toBe("360.0000");
  });
});
