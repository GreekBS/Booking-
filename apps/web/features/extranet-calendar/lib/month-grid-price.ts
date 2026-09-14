import { getNightlyRate } from "@/features/availability/lib/nightly-rates";
import type { RatePlanRecord } from "@/lib/admin/types";

export interface MonthGridDayPrice {
  display: string;
  title: string;
  unavailable: boolean;
}

/** Month-grid only — currency symbol with no insignificant trailing zeros. */
function formatMonthGridPriceDisplay(amount: string, currency: string): string {
  const value = Number.parseFloat(amount);
  if (Number.isNaN(value)) return amount;
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  }).format(value);
}

export function resolveMonthGridDayPrice(
  ratePlan: RatePlanRecord | null | undefined,
  date: string,
  options: { ready: boolean; loading: boolean },
): MonthGridDayPrice | null {
  if (!options.ready || options.loading) return null;

  const nightly = getNightlyRate(ratePlan, date);
  if (!nightly) {
    return {
      display: "—",
      title: "Nightly rate unavailable",
      unavailable: true,
    };
  }

  const season = nightly.seasonName ? ` (${nightly.seasonName})` : "";
  const dow = nightly.hasDowModifier ? " · day-of-week rate" : "";

  return {
    display: formatMonthGridPriceDisplay(nightly.amount, nightly.currency),
    title: `Nightly rate: ${nightly.amount} ${nightly.currency}${season}${dow}`,
    unavailable: false,
  };
}
