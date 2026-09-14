import { addDaysIso, todayIso } from "@/features/availability/lib/calendar-utils";

export const DAYS_PER_ROW = 10;
export const MONTHS_INITIAL = 3;
export const MONTHS_LOAD_MORE = 3;

export interface MonthGridRow {
  dates: string[];
}

export interface MonthGridSection {
  key: string;
  label: string;
  rows: MonthGridRow[];
}

export function startOfMonthIso(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
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

function chunkDates(dates: string[]): MonthGridRow[] {
  const rows: MonthGridRow[] = [];
  for (let i = 0; i < dates.length; i += DAYS_PER_ROW) {
    rows.push({ dates: dates.slice(i, i + DAYS_PER_ROW) });
  }
  return rows;
}

export function buildMonthGridSections(anchorMonthIso: string, monthCount: number): MonthGridSection[] {
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
      rows: chunkDates(monthDates),
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
  return sections.flatMap((section) => section.rows.flatMap((row) => row.dates));
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
