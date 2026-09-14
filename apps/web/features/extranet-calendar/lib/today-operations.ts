import type { CalendarRecord } from "@/lib/admin/types";
import { OPERATOR_BLOCK_TYPES } from "@/lib/admin/types";
import { dateInStayPeriod } from "@/features/availability/lib/calendar-utils";
import type { RackPropertyGroup } from "../types";

export type TodayOpKind = "arrival" | "departure" | "in-house" | "hold" | "block";

export interface TodayOpItem {
  id: string;
  kind: TodayOpKind;
  unitId: string;
  unitName: string;
  propertyName: string;
  label: string;
  detail: string;
  bookingId?: string;
  holdId?: string;
  blockId?: string;
  blockType?: string;
  checkIn: string;
  checkOut: string;
  reason?: string | null;
  bookingStatus?: string;
}

export interface TodayOperationsSnapshot {
  arrivals: TodayOpItem[];
  departures: TodayOpItem[];
  inHouse: TodayOpItem[];
  holds: TodayOpItem[];
  blocks: TodayOpItem[];
}

function isOperatorBlock(blockType: string): boolean {
  return OPERATOR_BLOCK_TYPES.includes(blockType as (typeof OPERATOR_BLOCK_TYPES)[number]);
}

export function buildTodayOperations(
  groups: RackPropertyGroup[],
  calendarsByUnit: Record<string, CalendarRecord>,
  today: string,
): TodayOperationsSnapshot {
  const arrivals: TodayOpItem[] = [];
  const departures: TodayOpItem[] = [];
  const inHouse: TodayOpItem[] = [];
  const holds: TodayOpItem[] = [];
  const blocks: TodayOpItem[] = [];

  for (const group of groups) {
    for (const unit of group.units) {
      const cal = calendarsByUnit[unit.unitId];
      if (!cal) continue;

      for (const booking of cal.bookings) {
        if (booking.status === "cancelled") continue;
        const base = {
          unitId: unit.unitId,
          unitName: unit.unitName,
          propertyName: unit.propertyName,
          checkIn: booking.checkIn,
          checkOut: booking.checkOut,
          bookingId: booking.id,
          bookingStatus: booking.status,
        };

        if (booking.checkIn === today) {
          arrivals.push({
            ...base,
            id: `arr-b-${booking.id}`,
            kind: "arrival",
            label: booking.guestName,
            detail: `Check-in · ${booking.status.replace(/_/g, " ")}`,
          });
        }

        if (booking.checkOut === today) {
          departures.push({
            ...base,
            id: `dep-b-${booking.id}`,
            kind: "departure",
            label: booking.guestName,
            detail: "Check-out",
          });
        }

        if (dateInStayPeriod(today, booking.checkIn, booking.checkOut)) {
          inHouse.push({
            ...base,
            id: `inh-b-${booking.id}`,
            kind: "in-house",
            label: booking.guestName,
            detail: `${booking.checkIn} → ${booking.checkOut}`,
          });
        }
      }

      for (const hold of cal.holds) {
        if (hold.status !== "active") continue;
        const base = {
          unitId: unit.unitId,
          unitName: unit.unitName,
          propertyName: unit.propertyName,
          checkIn: hold.checkIn,
          checkOut: hold.checkOut,
          holdId: hold.id,
        };

        if (hold.checkIn === today) {
          arrivals.push({
            ...base,
            id: `arr-h-${hold.id}`,
            kind: "arrival",
            label: unit.unitName,
            detail: "Hold arrival",
          });
        }

        if (hold.checkOut === today) {
          departures.push({
            ...base,
            id: `dep-h-${hold.id}`,
            kind: "departure",
            label: unit.unitName,
            detail: "Hold departure",
          });
        }

        if (dateInStayPeriod(today, hold.checkIn, hold.checkOut)) {
          holds.push({
            ...base,
            id: `hold-${hold.id}`,
            kind: "hold",
            label: unit.unitName,
            detail: `${hold.checkIn} → ${hold.checkOut}`,
          });
        }
      }

      for (const block of cal.blocks) {
        if (block.status !== "active" || !isOperatorBlock(block.blockType)) continue;
        if (!dateInStayPeriod(today, block.checkIn, block.checkOut)) continue;

        blocks.push({
          id: `block-${block.id}`,
          kind: "block",
          unitId: unit.unitId,
          unitName: unit.unitName,
          propertyName: unit.propertyName,
          label: block.blockType.replace(/_/g, " "),
          detail: block.reason?.trim() || `${block.checkIn} → ${block.checkOut}`,
          blockId: block.id,
          blockType: block.blockType,
          checkIn: block.checkIn,
          checkOut: block.checkOut,
          reason: block.reason,
        });
      }
    }
  }

  const byLabel = (a: TodayOpItem, b: TodayOpItem) => a.label.localeCompare(b.label);

  return {
    arrivals: arrivals.sort(byLabel),
    departures: departures.sort(byLabel),
    inHouse: inHouse.sort(byLabel),
    holds: holds.sort(byLabel),
    blocks: blocks.sort(byLabel),
  };
}
