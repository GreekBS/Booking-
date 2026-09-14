import type { CalendarRecord } from "@/lib/admin/types";
import { addDaysIso } from "./calendar-utils";

export interface OccupancyMetrics {
  today: number | null;
  next7: number | null;
  next30: number | null;
}

function enumerateDates(from: string, count: number): string[] {
  const dates: string[] = [];
  for (let i = 0; i < count; i++) {
    dates.push(addDaysIso(from, i));
  }
  return dates;
}

function isDateOccupied(calendar: CalendarRecord, date: string): boolean {
  const hasBooking = calendar.bookings.some(
    (b) => b.status !== "cancelled" && date >= b.checkIn && date < b.checkOut,
  );
  if (hasBooking) return true;

  const hasHold = calendar.holds.some(
    (h) => h.status === "active" && date >= h.checkIn && date < h.checkOut,
  );
  if (hasHold) return true;

  return calendar.blocks.some(
    (b) => b.status === "active" && date >= b.checkIn && date < b.checkOut,
  );
}

function occupancyPercent(calendar: CalendarRecord | undefined, dates: string[]): number | null {
  if (!calendar || dates.length === 0) return null;
  const occupied = dates.filter((d) => isDateOccupied(calendar, d)).length;
  return Math.round((occupied / dates.length) * 100);
}

export function computeUnitOccupancy(
  calendar: CalendarRecord | undefined,
  today: string,
  loadedDates: string[],
): OccupancyMetrics {
  const loaded = new Set(loadedDates);
  const intersect = (dates: string[]) => dates.filter((d) => loaded.has(d));

  const todayWindow = intersect([today]);
  const weekWindow = intersect(enumerateDates(today, 7));
  const monthWindow = intersect(enumerateDates(today, 30));

  return {
    today: todayWindow.length > 0 ? occupancyPercent(calendar, todayWindow) : null,
    next7: weekWindow.length > 0 ? occupancyPercent(calendar, weekWindow) : null,
    next30: monthWindow.length > 0 ? occupancyPercent(calendar, monthWindow) : null,
  };
}

export function occupancyHeatClass(percent: number | null): string {
  if (percent === null) return "bg-muted/40 text-muted-foreground";
  if (percent === 0) return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400";
  if (percent < 40) return "bg-amber-500/15 text-amber-800 dark:text-amber-300";
  if (percent < 75) return "bg-orange-500/20 text-orange-800 dark:text-orange-300";
  return "bg-red-500/20 text-red-800 dark:text-red-300";
}
