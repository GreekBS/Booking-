import type { AvailabilityRulesRecord } from "@/lib/admin/types";
import { dayOfWeekUtc } from "@/features/availability/lib/calendar-utils";

export type DayCellAvailability = "available" | "closed";

export interface DayCellState {
  availability: DayCellAvailability;
  label: string;
  ctaAllowed: boolean;
  ctdAllowed: boolean;
}

export function resolveDayCellState(
  date: string,
  rules: AvailabilityRulesRecord | undefined,
): DayCellState {
  const dow = dayOfWeekUtc(date);
  const ctaAllowed =
    !rules || rules.checkInDays.length === 0 || rules.checkInDays.includes(dow);
  const ctdAllowed =
    !rules || rules.checkOutDays.length === 0 || rules.checkOutDays.includes(dow);

  if (!ctaAllowed) {
    return {
      availability: "closed",
      label: "Closed to arrival",
      ctaAllowed,
      ctdAllowed,
    };
  }

  return {
    availability: "available",
    label: "Available",
    ctaAllowed,
    ctdAllowed,
  };
}
