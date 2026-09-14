import type { CalendarRecord } from "@/lib/admin/types";
import { OPERATOR_BLOCK_TYPES } from "@/lib/admin/types";
import { dateInStayPeriod } from "@/features/availability/lib/calendar-utils";

export function isDateOccupied(calendar: CalendarRecord | undefined, date: string): boolean {
  if (!calendar) return false;

  const booked = calendar.bookings.some(
    (b) => b.status !== "cancelled" && dateInStayPeriod(date, b.checkIn, b.checkOut),
  );
  if (booked) return true;

  const held = calendar.holds.some(
    (h) => h.status === "active" && dateInStayPeriod(date, h.checkIn, h.checkOut),
  );
  if (held) return true;

  return calendar.blocks.some(
    (b) =>
      b.status === "active" &&
      OPERATOR_BLOCK_TYPES.includes(b.blockType as (typeof OPERATOR_BLOCK_TYPES)[number]) &&
      dateInStayPeriod(date, b.checkIn, b.checkOut),
  );
}
