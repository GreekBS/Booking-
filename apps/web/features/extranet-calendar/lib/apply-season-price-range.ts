import type { RatePlanRecord } from "@/lib/admin/types";
import { addDaysIso } from "./timeline-model";

export const SINGLE_NIGHT_SEASON_ERROR =
  "Single-night seasonal price overrides are not supported yet. Please select at least 2 nights.";

type RateSeason = RatePlanRecord["seasons"][number];

/** Exclusive stay [checkIn, checkOut) → inclusive season bounds used by PricingCalculator. */
export function stayRangeToSeasonBounds(
  checkIn: string,
  checkOut: string,
): { startDate: string; endDate: string } {
  return {
    startDate: checkIn,
    endDate: addDaysIso(checkOut, -1),
  };
}

export function validateSeasonPriceRange(checkIn: string, checkOut: string): string | null {
  const { startDate, endDate } = stayRangeToSeasonBounds(checkIn, checkOut);
  if (startDate === endDate) return SINGLE_NIGHT_SEASON_ERROR;
  if (startDate > endDate) return "Invalid date range";
  return null;
}

function seasonsOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart <= bEnd && aEnd >= bStart;
}

/** DB requires startDate < endDate; single-night remnants are omitted (revert to base rate). */
function trimSeasonSegment(
  season: RateSeason,
  startDate: string,
  endDate: string,
): RateSeason | null {
  if (startDate >= endDate) return null;
  return {
    ...season,
    id: crypto.randomUUID(),
    startDate,
    endDate,
  };
}

/**
 * Split overlapping seasons and insert a new seasonal nightly rate for the inclusive date range.
 * Existing non-overlapping seasons are preserved; overlap remnants keep their original amounts.
 */
export function applySeasonPriceToRange(
  plan: RatePlanRecord,
  checkIn: string,
  checkOut: string,
  nightlyAmount: string,
): RatePlanRecord {
  const { startDate, endDate } = stayRangeToSeasonBounds(checkIn, checkOut);

  const newSeason: RateSeason = {
    id: crypto.randomUUID(),
    name: `${startDate} – ${endDate}`,
    startDate,
    endDate,
    nightlyAmount,
  };

  const updatedSeasons: RateSeason[] = [];

  for (const season of plan.seasons) {
    if (!seasonsOverlap(season.startDate, season.endDate, startDate, endDate)) {
      updatedSeasons.push(season);
      continue;
    }

    if (season.startDate < startDate) {
      const left = trimSeasonSegment(season, season.startDate, addDaysIso(startDate, -1));
      if (left) updatedSeasons.push(left);
    }

    if (season.endDate > endDate) {
      const right = trimSeasonSegment(season, addDaysIso(endDate, 1), season.endDate);
      if (right) updatedSeasons.push(right);
    }
  }

  updatedSeasons.push(newSeason);
  updatedSeasons.sort((a, b) => a.startDate.localeCompare(b.startDate));

  return { ...plan, seasons: updatedSeasons };
}
