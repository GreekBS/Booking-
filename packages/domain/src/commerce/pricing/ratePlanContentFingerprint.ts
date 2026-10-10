import { sha256HexUtf8 } from "../../channels/utils/sha256Hex";
import type { RatePlanProps } from "../shared/types/CommerceTypes";

/**
 * Canonical pricing content for equivalence / confirmation tokens (C3-H2c).
 * Excludes RateSeason ids and other identity metadata.
 */
export function canonicalRatePlanContent(plan: RatePlanProps): string {
  const seasons = [...plan.seasons]
    .map((s) => ({
      name: s.name.trim(),
      startDate: s.startDate,
      endDate: s.endDate,
      nightlyAmount: s.nightlyAmount,
    }))
    .sort((a, b) => {
      if (a.startDate !== b.startDate) return a.startDate < b.startDate ? -1 : 1;
      if (a.endDate !== b.endDate) return a.endDate < b.endDate ? -1 : 1;
      if (a.name !== b.name) return a.name < b.name ? -1 : 1;
      return a.nightlyAmount < b.nightlyAmount ? -1 : 1;
    });

  const dowModifiers = [...plan.dowModifiers]
    .map((m) => ({
      dayOfWeek: m.dayOfWeek,
      modifierType: m.modifierType,
      modifierValue: m.modifierValue,
    }))
    .sort((a, b) => a.dayOfWeek - b.dayOfWeek);

  // LOS is not persistable today — fingerprint only empty arrays for templates.
  const losDiscounts = [...(plan.losDiscounts ?? [])]
    .map((d) => ({
      minNights: d.minNights,
      percentOff: d.percentOff,
    }))
    .sort((a, b) => a.minNights - b.minNights);

  return JSON.stringify({
    v: 1,
    baseNightlyAmount: plan.baseNightlyAmount,
    currency: plan.currency.trim().toUpperCase(),
    seasons,
    dowModifiers,
    losDiscounts,
  });
}

export function ratePlanContentFingerprint(plan: RatePlanProps): string {
  return sha256HexUtf8(canonicalRatePlanContent(plan));
}

export function ratePlansContentEqual(
  a: RatePlanProps,
  b: RatePlanProps,
): boolean {
  return ratePlanContentFingerprint(a) === ratePlanContentFingerprint(b);
}
