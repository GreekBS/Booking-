import { addDaysIso, buildDateRange, buildMonthSpans, todayIso } from "@/features/availability/lib/calendar-utils";
import type { MonthSpan } from "@/features/availability/lib/calendar-utils";
import { getDensityTokens, type CalendarDensity } from "./density";

export { addDaysIso, buildDateRange, todayIso };
export type { MonthSpan };

export function buildTimelineModel(
  rangeStart: string,
  rangeDays: number,
  density: CalendarDensity = "comfortable",
) {
  const dates = buildDateRange(rangeStart, rangeDays);
  const monthSpans = buildMonthSpans(dates);
  const today = todayIso();
  const todayIndex = dates.indexOf(today);
  const dayWidth = getDensityTokens(density).dayWidthPx;
  const timelineWidthPx = dates.length * dayWidth;

  return {
    dates,
    monthSpans,
    today,
    todayIndex,
    rangeEnd: addDaysIso(rangeStart, rangeDays),
    timelineWidthPx,
  };
}
