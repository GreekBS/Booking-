import type { CalendarRecord } from "@/lib/admin/types";
import { OPERATOR_BLOCK_TYPES } from "@/lib/admin/types";
import type { OperatorBlockType } from "@/lib/admin/types";
import { addDaysIso } from "./calendar-utils";
import { computeUnitOccupancy } from "./occupancy";

export interface PropertySummaryMetrics {
  unitCount: number;
  activeBookings: number;
  activeHolds: number;
  operatorBlocks: number;
  occupancyPercent: number | null;
  upcomingArrivals: number;
  upcomingDepartures: number;
}

function isOperatorBlock(blockType: string): blockType is OperatorBlockType {
  return OPERATOR_BLOCK_TYPES.includes(blockType as OperatorBlockType);
}

export function computePropertySummary(
  unitIds: string[],
  calendars: Record<string, CalendarRecord>,
  today: string,
  loadedDates: string[],
  horizonDays = 7,
): PropertySummaryMetrics {
  const horizonEnd = addDaysIso(today, horizonDays);
  let activeBookings = 0;
  let activeHolds = 0;
  let operatorBlocks = 0;
  let upcomingArrivals = 0;
  let upcomingDepartures = 0;

  const occupancySamples: number[] = [];

  for (const unitId of unitIds) {
    const cal = calendars[unitId];
    if (!cal) continue;

    activeBookings += cal.bookings.filter((b) => b.status !== "cancelled").length;
    activeHolds += cal.holds.filter((h) => h.status === "active").length;
    operatorBlocks += cal.blocks.filter(
      (b) => b.status === "active" && isOperatorBlock(b.blockType),
    ).length;

    for (const b of cal.bookings) {
      if (b.status === "cancelled") continue;
      if (b.checkIn >= today && b.checkIn <= horizonEnd) upcomingArrivals += 1;
      if (b.checkOut >= today && b.checkOut <= horizonEnd) upcomingDepartures += 1;
    }

    for (const h of cal.holds) {
      if (h.status !== "active") continue;
      if (h.checkIn >= today && h.checkIn <= horizonEnd) upcomingArrivals += 1;
      if (h.checkOut >= today && h.checkOut <= horizonEnd) upcomingDepartures += 1;
    }

    const occ = computeUnitOccupancy(cal, today, loadedDates);
    if (occ.next7 !== null) occupancySamples.push(occ.next7);
  }

  const occupancyPercent =
    occupancySamples.length > 0
      ? Math.round(
          occupancySamples.reduce((sum, v) => sum + v, 0) / occupancySamples.length,
        )
      : null;

  return {
    unitCount: unitIds.length,
    activeBookings,
    activeHolds,
    operatorBlocks,
    occupancyPercent,
    upcomingArrivals,
    upcomingDepartures,
  };
}
