import { Money } from "../shared/value-objects/Money";
import { StayPeriod } from "../shared/value-objects/StayPeriod";
import { LocalDate } from "../shared/value-objects/LocalDate";
import type {
  DowModifierProps,
  LosDiscountProps,
  RatePlanProps,
  RateSeasonProps,
} from "../shared/types/CommerceTypes";

export interface NightlyLineItem {
  date: string;
  baseAmount: string;
  adjustedAmount: string;
  currency: string;
}

export interface PricingResult {
  lineItems: NightlyLineItem[];
  subtotal: Money;
  losDiscountAmount: Money;
  total: Money;
  currency: string;
  quotedAt: Date;
}

export class PricingCalculator {
  calculate(
    ratePlan: RatePlanProps,
    stayPeriod: StayPeriod,
    quotedAt: Date,
  ): PricingResult {
    const currency = ratePlan.currency;
    const lineItems: NightlyLineItem[] = [];

    for (const night of stayPeriod.nights()) {
      const base = this.resolveBaseRate(ratePlan, night);
      const withDow = this.applyDowModifiers(base, night, ratePlan.dowModifiers);
      lineItems.push({
        date: night.value,
        baseAmount: base.amount,
        adjustedAmount: withDow.amount,
        currency,
      });
    }

    let subtotal = Money.zero(currency);
    for (const item of lineItems) {
      subtotal = subtotal.add(Money.create(item.adjustedAmount, currency));
    }

    const losDiscount = this.calculateLosDiscount(
      subtotal,
      stayPeriod.nightCount(),
      ratePlan.losDiscounts,
    );
    const total = subtotal.subtract(losDiscount);

    return {
      lineItems,
      subtotal,
      losDiscountAmount: losDiscount,
      total,
      currency,
      quotedAt,
    };
  }

  private resolveBaseRate(ratePlan: RatePlanProps, night: LocalDate): Money {
    const season = this.findSeason(ratePlan.seasons, night);
    const amount = season?.nightlyAmount ?? ratePlan.baseNightlyAmount;
    return Money.create(amount, ratePlan.currency);
  }

  private findSeason(
    seasons: RateSeasonProps[],
    night: LocalDate,
  ): RateSeasonProps | undefined {
    // First matching season in array order wins when ranges overlap.
    return seasons.find((season) => {
      const start = LocalDate.create(season.startDate);
      const end = LocalDate.create(season.endDate);
      return night.isAfterOrEqual(start) && night.isBeforeOrEqual(end);
    });
  }

  private applyDowModifiers(
    base: Money,
    night: LocalDate,
    modifiers: DowModifierProps[],
  ): Money {
    const modifier = modifiers.find((m) => m.dayOfWeek === night.dayOfWeek());
    if (!modifier) {
      return base;
    }

    if (modifier.modifierType === "fixed") {
      return base.add(Money.create(modifier.modifierValue, base.currency));
    }

    return base.applyPercentIncrease(modifier.modifierValue);
  }

  private calculateLosDiscount(
    subtotal: Money,
    nightCount: number,
    discounts: LosDiscountProps[],
  ): Money {
    const applicable = discounts
      .filter((d) => nightCount >= d.minNights)
      .sort((a, b) => b.minNights - a.minNights)[0];

    if (!applicable) {
      return Money.zero(subtotal.currency);
    }

    return subtotal.applyPercent(applicable.percentOff);
  }
}
