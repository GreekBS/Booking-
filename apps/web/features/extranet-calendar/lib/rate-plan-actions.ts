import { fetchRatePlan, updateRatePlan } from "@/lib/admin/api";
import type { RatePlanRecord } from "@/lib/admin/types";
import {
  formatRatePlanForDisplay,
  normalizeDecimalMoney,
  normalizeRatePlanForSubmit,
} from "@/lib/admin/utils";
import { applySeasonPriceToRange, validateSeasonPriceRange } from "./apply-season-price-range";
import { validateExclusiveDateRange } from "./selection-availability-actions";

export async function setNightlyPriceForDateRange(params: {
  tenantId: string;
  unitId: string;
  checkIn: string;
  checkOut: string;
  nightlyPrice: string;
  existingPlan?: RatePlanRecord | null;
}): Promise<RatePlanRecord> {
  const rangeError = validateExclusiveDateRange({
    checkIn: params.checkIn,
    checkOut: params.checkOut,
  });
  if (rangeError) throw new Error(rangeError);

  const seasonRangeError = validateSeasonPriceRange(params.checkIn, params.checkOut);
  if (seasonRangeError) throw new Error(seasonRangeError);

  const normalizedPrice = normalizeDecimalMoney(params.nightlyPrice);
  if (!normalizedPrice) {
    throw new Error("Enter a valid amount (e.g. 120 or 120.50).");
  }

  const plan =
    params.existingPlan ?? (await fetchRatePlan(params.tenantId, params.unitId));
  if (!plan) {
    throw new Error("Rate plan not found for this unit");
  }

  const merged = applySeasonPriceToRange(
    plan,
    params.checkIn,
    params.checkOut,
    normalizedPrice,
  );

  const { payload, errors } = normalizeRatePlanForSubmit(merged);
  if (Object.keys(errors).length > 0) {
    throw new Error("Enter a valid amount (e.g. 120 or 120.50).");
  }

  const saved = await updateRatePlan(params.tenantId, params.unitId, payload);
  return formatRatePlanForDisplay(saved);
}
