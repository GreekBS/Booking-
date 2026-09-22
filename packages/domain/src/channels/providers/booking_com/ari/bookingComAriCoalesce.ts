import type { BookingComAriResolvedProjection } from "./BookingComAriProjection";
import {
  buildBookingComAriCoalesceKey,
} from "./BookingComAriProjection";
import { enumerateMonthKeys } from "./bookingComAriBatch";

/**
 * Keep the highest generation per coalesce key (month + field family).
 * Deterministic: newer generation always wins; no lost final state.
 */
export function coalesceBookingComAriProjections(
  projections: readonly BookingComAriResolvedProjection[],
): BookingComAriResolvedProjection[] {
  const winners = new Map<string, BookingComAriResolvedProjection>();

  for (const projection of projections) {
    for (const monthKey of enumerateMonthKeys(projection.from, projection.to)) {
      const key = buildBookingComAriCoalesceKey({
        tenantId: projection.tenantId,
        connectionId: projection.connectionId,
        hotelId: projection.hotelId,
        roomTypeId: projection.roomTypeId,
        ratePlanId: projection.ratePlanId,
        monthKey,
        fieldFamily: projection.fieldFamily,
      });
      const existing = winners.get(key);
      if (!existing || projection.generation >= existing.generation) {
        winners.set(key, projection);
      }
    }
  }

  return [...winners.values()].sort((a, b) => {
    if (a.generation !== b.generation) return a.generation - b.generation;
    return a.from.localeCompare(b.from);
  });
}

export function isStaleBookingComAriGeneration(input: {
  candidateGeneration: number;
  highestKnownGeneration: number;
  lastSucceededGeneration: number | null;
}): "ok" | "stale_vs_pending" | "stale_vs_success" {
  if (
    input.lastSucceededGeneration != null &&
    input.candidateGeneration <= input.lastSucceededGeneration
  ) {
    return "stale_vs_success";
  }
  if (input.candidateGeneration < input.highestKnownGeneration) {
    return "stale_vs_pending";
  }
  return "ok";
}
