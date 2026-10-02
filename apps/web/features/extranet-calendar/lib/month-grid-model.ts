import { addDaysIso, todayIso } from "@/features/availability/lib/calendar-utils";

/**
 * SSR / first-paint fallback column count before container measurement.
 * Not the permanent runtime column count — ResizeObserver resolves the live value.
 */
export const MONTH_GRID_COLUMNS_DEFAULT = 9;
export const MONTH_GRID_COLUMNS_MIN = 4;
export const MONTH_GRID_COLUMNS_MAX = 12;

/** @deprecated Use MONTH_GRID_COLUMNS_DEFAULT — previously the fixed runtime contract. */
export const MONTH_GRID_COLUMNS = MONTH_GRID_COLUMNS_DEFAULT;
/** @deprecated Use MONTH_GRID_COLUMNS_DEFAULT */
export const DAYS_PER_ROW = MONTH_GRID_COLUMNS_DEFAULT;

export const MONTHS_INITIAL = 3;
export const MONTHS_LOAD_MORE = 3;

export interface MonthGridRow {
  dates: string[];
}

/**
 * Month presentation unit. `dates` is the full month; rows are chunked at
 * render time from the resolved adaptive column count.
 */
export interface MonthGridSection {
  key: string;
  label: string;
  dates: string[];
}

export function startOfMonthIso(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

/** Shift an YYYY-MM-01 (or any ISO date) by whole months (UTC). */
export function shiftMonthIso(iso: string, deltaMonths: number): string {
  const anchor = startOfMonthIso(iso);
  const year = Number(anchor.slice(0, 4));
  const monthIndex = Number(anchor.slice(5, 7)) - 1;
  const shifted = new Date(Date.UTC(year, monthIndex + deltaMonths, 1));
  const yy = shifted.getUTCFullYear();
  const mm = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  return `${yy}-${mm}-01`;
}

/** Human period label for the ops toolbar (e.g. "September 2026"). */
export function formatPeriodLabel(monthIso: string): string {
  const anchor = startOfMonthIso(monthIso);
  const year = Number(anchor.slice(0, 4));
  const monthIndex = Number(anchor.slice(5, 7)) - 1;
  return new Date(Date.UTC(year, monthIndex, 1)).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function monthLabel(year: number, monthIndex: number): string {
  const d = new Date(Date.UTC(year, monthIndex, 1));
  return d
    .toLocaleDateString(undefined, { month: "long", year: "numeric", timeZone: "UTC" })
    .toUpperCase();
}

function datesInMonth(year: number, monthIndex: number): string[] {
  const days = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const dates: string[] = [];
  for (let day = 1; day <= days; day++) {
    const dd = String(day).padStart(2, "0");
    const mm = String(monthIndex + 1).padStart(2, "0");
    dates.push(`${year}-${mm}-${dd}`);
  }
  return dates;
}

/** Presentation-only row chunking for the adaptive month grid. */
export function chunkDates(dates: string[], columns: number): MonthGridRow[] {
  const cols = Math.max(1, Math.floor(columns));
  const rows: MonthGridRow[] = [];
  for (let i = 0; i < dates.length; i += cols) {
    rows.push({ dates: dates.slice(i, i + cols) });
  }
  return rows;
}

/** Row length counts for a month with `dayCount` days and `columns` tracks. */
export function monthGridRowLengths(dayCount: number, columns: number): number[] {
  return chunkDates(
    Array.from({ length: dayCount }, (_, i) => String(i + 1)),
    columns,
  ).map((row) => row.dates.length);
}

export function buildMonthGridSections(
  anchorMonthIso: string,
  monthCount: number,
): MonthGridSection[] {
  const anchor = startOfMonthIso(anchorMonthIso);
  const [yearStr, monthStr] = anchor.split("-");
  let year = Number(yearStr);
  let monthIndex = Number(monthStr) - 1;

  const sections: MonthGridSection[] = [];

  for (let i = 0; i < monthCount; i++) {
    const monthDates = datesInMonth(year, monthIndex);
    const mm = String(monthIndex + 1).padStart(2, "0");
    sections.push({
      key: `${year}-${mm}`,
      label: monthLabel(year, monthIndex),
      dates: monthDates,
    });

    monthIndex += 1;
    if (monthIndex > 11) {
      monthIndex = 0;
      year += 1;
    }
  }

  return sections;
}

export function flattenMonthGridDates(sections: MonthGridSection[]): string[] {
  return sections.flatMap((section) => section.dates);
}

export function buildMonthGridModel(anchorMonthIso: string, loadedMonthCount: number) {
  const sections = buildMonthGridSections(anchorMonthIso, loadedMonthCount);
  const dates = flattenMonthGridDates(sections);
  const today = todayIso();
  const rangeStart = dates[0] ?? startOfMonthIso(anchorMonthIso);
  const lastDate = dates[dates.length - 1] ?? rangeStart;
  const rangeEnd = addDaysIso(lastDate, 1);

  return {
    sections,
    dates,
    today,
    rangeStart,
    rangeEnd,
    anchorMonth: startOfMonthIso(anchorMonthIso),
  };
}
