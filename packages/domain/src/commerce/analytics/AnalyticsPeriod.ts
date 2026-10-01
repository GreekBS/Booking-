import { LocalDate } from "../shared/value-objects/LocalDate";

export type AnalyticsPeriodType =
  | "week"
  | "month"
  | "quarter"
  | "half_year"
  | "year";

export interface AnalyticsPeriodWindow {
  periodType: AnalyticsPeriodType;
  startDate: string;
  endDateExclusive: string;
  /** Property-local calendar year for year/quarter/month/half anchors. */
  year: number;
  month?: number;
  quarter?: 1 | 2 | 3 | 4;
  half?: 1 | 2;
  /** Monday of the week when periodType === week. */
  weekStart?: string;
  displayLabel: string;
}

export interface AnalyticsPeriodInput {
  period?: string | null;
  year?: string | null;
  month?: string | null;
  quarter?: string | null;
  half?: string | null;
  /** Week start (Monday) YYYY-MM-DD, or any date within the week. */
  week?: string | null;
}

const PERIOD_TYPES = new Set<AnalyticsPeriodType>([
  "week",
  "month",
  "quarter",
  "half_year",
  "year",
]);

function parseIntInRange(
  raw: string | null | undefined,
  min: number,
  max: number,
): number | null {
  if (raw == null || raw === "") return null;
  if (!/^-?\d+$/.test(raw.trim())) return null;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < min || n > max) return null;
  return n;
}

function mondayOf(date: LocalDate): LocalDate {
  // UTC dayOfWeek: 0=Sun … 6=Sat. Monday-start: Mon=0 … Sun=6.
  const dow = date.dayOfWeek();
  const daysFromMonday = dow === 0 ? 6 : dow - 1;
  return date.addDays(-daysFromMonday);
}

function monthStart(year: number, month: number): LocalDate {
  return LocalDate.create(
    `${year}-${String(month).padStart(2, "0")}-01`,
  );
}

function addMonths(year: number, month: number, delta: number): {
  year: number;
  month: number;
} {
  const idx = year * 12 + (month - 1) + delta;
  return { year: Math.floor(idx / 12), month: (idx % 12) + 1 };
}

const MONTH_LABELS_EL = [
  "Ιανουάριος",
  "Φεβρουάριος",
  "Μάρτιος",
  "Απρίλιος",
  "Μάιος",
  "Ιούνιος",
  "Ιούλιος",
  "Αύγουστος",
  "Σεπτέμβριος",
  "Οκτώβριος",
  "Νοέμβριος",
  "Δεκέμβριος",
];

function formatDayMonth(iso: string): string {
  const d = LocalDate.create(iso);
  const [, m, day] = iso.split("-");
  const monthIdx = Number(m) - 1;
  const short = [
    "Ιαν",
    "Φεβ",
    "Μαρ",
    "Απρ",
    "Μαΐ",
    "Ιουν",
    "Ιουλ",
    "Αυγ",
    "Σεπ",
    "Οκτ",
    "Νοε",
    "Δεκ",
  ][monthIdx]!;
  return `${Number(day)} ${short}`;
}

/**
 * Resolve analytics period from URL-like params.
 * Invalid/missing values fall back to Year / propertyLocalToday's calendar year.
 */
export function resolveAnalyticsPeriod(
  input: AnalyticsPeriodInput,
  propertyLocalTodayIso: string,
): AnalyticsPeriodWindow {
  const today = LocalDate.create(propertyLocalTodayIso);
  const currentYear = Number(propertyLocalTodayIso.slice(0, 4));

  const rawPeriod = (input.period ?? "").trim().toLowerCase();
  const normalizedPeriod =
    rawPeriod === "half" ? "half_year" : rawPeriod;
  const periodType: AnalyticsPeriodType = PERIOD_TYPES.has(
    normalizedPeriod as AnalyticsPeriodType,
  )
    ? (normalizedPeriod as AnalyticsPeriodType)
    : "year";

  if (periodType === "year") {
    const year = parseIntInRange(input.year, 1970, 2100) ?? currentYear;
    return buildYear(year);
  }

  if (periodType === "month") {
    const year = parseIntInRange(input.year, 1970, 2100) ?? currentYear;
    const month =
      parseIntInRange(input.month, 1, 12) ??
      Number(propertyLocalTodayIso.slice(5, 7));
    return buildMonth(year, month);
  }

  if (periodType === "quarter") {
    const year = parseIntInRange(input.year, 1970, 2100) ?? currentYear;
    const quarter = (parseIntInRange(input.quarter, 1, 4) ??
      Math.floor((Number(propertyLocalTodayIso.slice(5, 7)) - 1) / 3) +
        1) as 1 | 2 | 3 | 4;
    return buildQuarter(year, quarter);
  }

  if (periodType === "half_year") {
    const year = parseIntInRange(input.year, 1970, 2100) ?? currentYear;
    const half = (parseIntInRange(input.half, 1, 2) ??
      (Number(propertyLocalTodayIso.slice(5, 7)) <= 6 ? 1 : 2)) as 1 | 2;
    return buildHalfYear(year, half);
  }

  // week
  let anchor: LocalDate = today;
  if (input.week) {
    try {
      anchor = LocalDate.create(input.week.trim());
    } catch {
      anchor = today;
    }
  }
  return buildWeek(mondayOf(anchor));
}

export function buildYear(year: number): AnalyticsPeriodWindow {
  const startDate = `${year}-01-01`;
  const endDateExclusive = `${year + 1}-01-01`;
  return {
    periodType: "year",
    startDate,
    endDateExclusive,
    year,
    displayLabel: String(year),
  };
}

export function buildMonth(year: number, month: number): AnalyticsPeriodWindow {
  const start = monthStart(year, month);
  const next = addMonths(year, month, 1);
  const end = monthStart(next.year, next.month);
  return {
    periodType: "month",
    startDate: start.value,
    endDateExclusive: end.value,
    year,
    month,
    displayLabel: `${MONTH_LABELS_EL[month - 1]} ${year}`,
  };
}

export function buildQuarter(
  year: number,
  quarter: 1 | 2 | 3 | 4,
): AnalyticsPeriodWindow {
  const startMonth = (quarter - 1) * 3 + 1;
  const start = monthStart(year, startMonth);
  const endMonth = startMonth + 3;
  const end =
    endMonth > 12
      ? monthStart(year + 1, endMonth - 12)
      : monthStart(year, endMonth);
  return {
    periodType: "quarter",
    startDate: start.value,
    endDateExclusive: end.value,
    year,
    quarter,
    displayLabel: `Q${quarter} ${year}`,
  };
}

export function buildHalfYear(
  year: number,
  half: 1 | 2,
): AnalyticsPeriodWindow {
  const startMonth = half === 1 ? 1 : 7;
  const start = monthStart(year, startMonth);
  const end =
    half === 1 ? monthStart(year, 7) : monthStart(year + 1, 1);
  return {
    periodType: "half_year",
    startDate: start.value,
    endDateExclusive: end.value,
    year,
    half,
    displayLabel: `H${half} ${year}`,
  };
}

export function buildWeek(monday: LocalDate): AnalyticsPeriodWindow {
  const start = mondayOf(monday);
  const end = start.addDays(7);
  const year = Number(start.value.slice(0, 4));
  const endInclusive = start.addDays(6);
  return {
    periodType: "week",
    startDate: start.value,
    endDateExclusive: end.value,
    year,
    weekStart: start.value,
    displayLabel: `${formatDayMonth(start.value)} – ${formatDayMonth(endInclusive.value)} ${endInclusive.value.slice(0, 4)}`,
  };
}

/** Days in [start, endExclusive). */
export function periodDayCount(
  startDate: string,
  endDateExclusive: string,
): number {
  return LocalDate.create(startDate).daysUntil(
    LocalDate.create(endDateExclusive),
  );
}

/**
 * Occupied nights of a stay intersecting [periodStart, periodEndExclusive).
 * Half-open stay: checkIn <= night < checkOut.
 */
export function occupiedNightsInPeriod(
  checkIn: string,
  checkOut: string,
  periodStart: string,
  periodEndExclusive: string,
): number {
  if (checkOut <= periodStart || checkIn >= periodEndExclusive) return 0;
  const start = checkIn > periodStart ? checkIn : periodStart;
  const end = checkOut < periodEndExclusive ? checkOut : periodEndExclusive;
  return Math.max(0, LocalDate.create(start).daysUntil(LocalDate.create(end)));
}

/** Total nights in stay (checkOut - checkIn). */
export function stayNightCount(checkIn: string, checkOut: string): number {
  return Math.max(
    0,
    LocalDate.create(checkIn).daysUntil(LocalDate.create(checkOut)),
  );
}

/**
 * Prorate stay totalAmount by nights overlapping the period.
 * Returns decimal string with up to 4 fractional digits (Money-style).
 */
export function prorateStayRevenue(
  totalAmount: string,
  checkIn: string,
  checkOut: string,
  periodStart: string,
  periodEndExclusive: string,
): number {
  const nights = stayNightCount(checkIn, checkOut);
  if (nights <= 0) return 0;
  const inPeriod = occupiedNightsInPeriod(
    checkIn,
    checkOut,
    periodStart,
    periodEndExclusive,
  );
  if (inPeriod <= 0) return 0;
  const total = Number.parseFloat(totalAmount);
  if (!Number.isFinite(total)) return 0;
  return (total * inPeriod) / nights;
}

export function shiftAnalyticsPeriod(
  window: AnalyticsPeriodWindow,
  direction: -1 | 1,
): AnalyticsPeriodWindow {
  switch (window.periodType) {
    case "year":
      return buildYear(window.year + direction);
    case "month": {
      const next = addMonths(window.year, window.month!, direction);
      return buildMonth(next.year, next.month);
    }
    case "quarter": {
      let q = (window.quarter! + direction) as number;
      let y = window.year;
      if (q < 1) {
        q = 4;
        y -= 1;
      } else if (q > 4) {
        q = 1;
        y += 1;
      }
      return buildQuarter(y, q as 1 | 2 | 3 | 4);
    }
    case "half_year": {
      let h = (window.half! + direction) as number;
      let y = window.year;
      if (h < 1) {
        h = 2;
        y -= 1;
      } else if (h > 2) {
        h = 1;
        y += 1;
      }
      return buildHalfYear(y, h as 1 | 2);
    }
    case "week": {
      const monday = LocalDate.create(window.weekStart ?? window.startDate);
      return buildWeek(monday.addDays(direction * 7));
    }
    default:
      return window;
  }
}

export function analyticsPeriodToSearchParams(
  window: AnalyticsPeriodWindow,
): URLSearchParams {
  const params = new URLSearchParams();
  params.set(
    "period",
    window.periodType === "half_year" ? "half" : window.periodType,
  );
  switch (window.periodType) {
    case "year":
      params.set("year", String(window.year));
      break;
    case "month":
      params.set("year", String(window.year));
      params.set("month", String(window.month));
      break;
    case "quarter":
      params.set("year", String(window.year));
      params.set("quarter", String(window.quarter));
      break;
    case "half_year":
      params.set("year", String(window.year));
      params.set("half", String(window.half));
      break;
    case "week":
      params.set("week", window.weekStart ?? window.startDate);
      break;
  }
  return params;
}
