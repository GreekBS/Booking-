import type { CalendarRecord } from "@/lib/admin/types";
import { OPERATOR_BLOCK_TYPES, type OperatorBlockType } from "@/lib/admin/types";
import { addDaysIso } from "@/features/availability/lib/calendar-utils";
import { computeUnitOccupancy } from "@/features/availability/lib/occupancy";

export interface UnitRackMeta {
  occupancy7d: number | null;
  activeBookings: number;
  activeHolds: number;
  operatorBlocks: number;
  upcomingArrivals: number;
  upcomingDepartures: number;
}

function isOperatorBlock(blockType: string): blockType is OperatorBlockType {
  return OPERATOR_BLOCK_TYPES.includes(blockType as OperatorBlockType);
}

export function computeUnitRackMeta(
  calendar: CalendarRecord | undefined,
  today: string,
  loadedDates: string[],
  horizonDays = 7,
): UnitRackMeta | null {
  if (!calendar) return null;

  const horizonEnd = addDaysIso(today, horizonDays);
  let upcomingArrivals = 0;
  let upcomingDepartures = 0;

  for (const b of calendar.bookings) {
    if (b.status === "cancelled") continue;
    if (b.checkIn >= today && b.checkIn <= horizonEnd) upcomingArrivals += 1;
    if (b.checkOut >= today && b.checkOut <= horizonEnd) upcomingDepartures += 1;
  }

  for (const h of calendar.holds) {
    if (h.status !== "active") continue;
    if (h.checkIn >= today && h.checkIn <= horizonEnd) upcomingArrivals += 1;
    if (h.checkOut >= today && h.checkOut <= horizonEnd) upcomingDepartures += 1;
  }

  const occ = computeUnitOccupancy(calendar, today, loadedDates);

  return {
    occupancy7d: occ.next7,
    activeBookings: calendar.bookings.filter((b) => b.status !== "cancelled").length,
    activeHolds: calendar.holds.filter((h) => h.status === "active").length,
    operatorBlocks: calendar.blocks.filter(
      (b) => b.status === "active" && isOperatorBlock(b.blockType),
    ).length,
    upcomingArrivals,
    upcomingDepartures,
  };
}
