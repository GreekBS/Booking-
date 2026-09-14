export const CELL_WIDTH_PX = 36;
export const CELL_HEIGHT_PX = 36;
export const UNIT_COL_WIDTH_PX = 200;
export const BAR_HEIGHT_PX = 28;
export const BAR_TOP_OFFSET_PX = 4;
export const DEFAULT_RANGE_DAYS = 35;

export interface MonthSpan {
  label: string;
  startIndex: number;
  length: number;
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function buildDateRange(from: string, dayCount: number): string[] {
  const dates: string[] = [];
  for (let i = 0; i < dayCount; i++) {
    dates.push(addDaysIso(from, i));
  }
  return dates;
}

/** Stay period [start, end) contains date. */
export function dateInStayPeriod(date: string, checkIn: string, checkOut: string): boolean {
  return date >= checkIn && date < checkOut;
}

export function rangesOverlap(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string,
): boolean {
  return aStart < bEnd && bStart < aEnd;
}

export function dayOfWeekUtc(iso: string): number {
  return new Date(`${iso}T00:00:00.000Z`).getUTCDay();
}

export function isWeekendUtc(iso: string): boolean {
  const dow = dayOfWeekUtc(iso);
  return dow === 0 || dow === 6;
}

export function isWeekStartUtc(iso: string): boolean {
  return dayOfWeekUtc(iso) === 1;
}

export function isoWeekNumber(iso: string): number {
  const d = new Date(`${iso}T00:00:00.000Z`);
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  return Math.ceil(((target.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

export function buildMonthSpans(dates: string[]): MonthSpan[] {
  if (dates.length === 0) return [];

  const spans: MonthSpan[] = [];
  let currentKey = "";

  for (let i = 0; i < dates.length; i++) {
    const iso = dates[i];
    if (!iso) continue;
    const key = iso.slice(0, 7);
    const d = new Date(`${iso}T00:00:00.000Z`);
    const label = d.toLocaleDateString(undefined, {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    });

    if (key !== currentKey) {
      spans.push({ label, startIndex: i, length: 1 });
      currentKey = key;
    } else {
      const last = spans[spans.length - 1];
      if (last) last.length += 1;
    }
  }

  return spans;
}

export function formatHeaderDate(iso: string): { dow: string; day: string; month: string } {
  const d = new Date(`${iso}T00:00:00.000Z`);
  return {
    dow: d.toLocaleDateString(undefined, { weekday: "short", timeZone: "UTC" }),
    day: String(d.getUTCDate()),
    month: d.toLocaleDateString(undefined, { month: "short", timeZone: "UTC" }),
  };
}

export function normalizeSelectionRange(from: string, to: string): { from: string; to: string } {
  if (from <= to) {
    return { from, to: addDaysIso(to, 1) };
  }
  return { from: to, to: addDaysIso(from, 1) };
}
