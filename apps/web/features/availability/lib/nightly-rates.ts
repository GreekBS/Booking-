import { PricingCalculator } from "@hcp/domain";
import { StayPeriod } from "@hcp/domain";
import type { RatePlanRecord } from "@/lib/admin/types";
import { formatDecimalMoneyForDisplay } from "@/lib/admin/utils";

const calculator = new PricingCalculator();

export interface NightlyRateInfo {
  amount: string;
  currency: string;
  seasonName?: string;
  hasDowModifier: boolean;
}

export function getNightlyRate(
  ratePlan: RatePlanRecord | null | undefined,
  date: string,
): NightlyRateInfo | null {
  if (!ratePlan) return null;

  try {
    const nextDay = addOneDay(date);
    const result = calculator.calculate(ratePlan, StayPeriod.create(date, nextDay), new Date());
    const line = result.lineItems[0];
    if (!line) return null;

    const season = ratePlan.seasons.find(
      (s) => date >= s.startDate && date <= s.endDate,
    );
    const dow = dayOfWeek(date);
    const hasDow = ratePlan.dowModifiers.some((m) => m.dayOfWeek === dow);

    return {
      amount: formatDecimalMoneyForDisplay(line.adjustedAmount),
      currency: line.currency,
      seasonName: season?.name,
      hasDowModifier: hasDow && line.adjustedAmount !== line.baseAmount,
    };
  } catch {
    return null;
  }
}

function addOneDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function dayOfWeek(iso: string): number {
  return new Date(`${iso}T00:00:00.000Z`).getUTCDay();
}
