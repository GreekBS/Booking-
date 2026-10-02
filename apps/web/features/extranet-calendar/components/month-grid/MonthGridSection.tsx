"use client";

import { useMemo } from "react";
import type { AvailabilityRulesRecord, CalendarRecord, RatePlanRecord } from "@/lib/admin/types";
import { buildCalendarSpans } from "@/features/availability/lib/span-layout";
import type { CalendarDensity } from "../../lib/density";
import { getMonthGridTokens } from "../../lib/density";
import type { MonthGridSection as MonthSection } from "../../lib/month-grid-model";
import { MONTH_LABEL_CLASS } from "../../lib/visual-theme";
import type { OverlayToggles } from "../../lib/overlay-types";
import type { RackUnit } from "../../types";
import { MonthGridDayCard } from "./MonthGridDayCard";
import { MonthGridSpanBar } from "./MonthGridSpanBar";

interface MonthGridSectionProps {
  section: MonthSection;
  unit: RackUnit;
  today: string;
  rules: AvailabilityRulesRecord | undefined;
  calendar: CalendarRecord | undefined;
  loading: boolean;
  density: CalendarDensity;
  overlays: OverlayToggles;
  ratePlan: RatePlanRecord | null | undefined;
  ratePlanReady: boolean;
  ratePlanLoading: boolean;
}

/**
 * Month of day cards rendered as deterministic 10-day rows (section.rows)
 * with a continuous reservation-bar overlay per row.
 */
export function MonthGridSection({
  section,
  unit,
  today,
  rules,
  calendar,
  loading,
  density,
  overlays,
  ratePlan,
  ratePlanReady,
  ratePlanLoading,
}: MonthGridSectionProps) {
  const tokens = getMonthGridTokens(density);

  return (
    <section className="mb-8" data-month-section={section.key} aria-label={section.label}>
      <h2 className={MONTH_LABEL_CLASS}>{section.label}</h2>

      <div className="mt-3 space-y-2">
        {section.rows.map((row, rowIndex) => (
          <MonthGridRow
            key={`${section.key}-row-${rowIndex}`}
            dates={row.dates}
            unit={unit}
            today={today}
            rules={rules}
            calendar={calendar}
            loading={loading}
            density={density}
            overlays={overlays}
            ratePlan={ratePlan}
            ratePlanReady={ratePlanReady}
            ratePlanLoading={ratePlanLoading}
            gapPx={tokens.gapPx}
            barHeightPx={tokens.barHeightPx}
          />
        ))}
      </div>
    </section>
  );
}

interface MonthGridRowProps {
  dates: string[];
  unit: RackUnit;
  today: string;
  rules: AvailabilityRulesRecord | undefined;
  calendar: CalendarRecord | undefined;
  loading: boolean;
  density: CalendarDensity;
  overlays: OverlayToggles;
  ratePlan: RatePlanRecord | null | undefined;
  ratePlanReady: boolean;
  ratePlanLoading: boolean;
  gapPx: number;
  barHeightPx: number;
}

function MonthGridRow({
  dates,
  unit,
  today,
  rules,
  calendar,
  loading,
  density,
  overlays,
  ratePlan,
  ratePlanReady,
  ratePlanLoading,
  gapPx,
  barHeightPx,
}: MonthGridRowProps) {
  const columnCount = dates.length;
  const spans = useMemo(() => buildCalendarSpans(calendar, dates), [calendar, dates]);

  const gridStyle = {
    gridTemplateColumns: `repeat(${columnCount}, minmax(4.75rem, 1fr))`,
    gap: gapPx,
  } as const;

  return (
    <div className="relative" data-month-grid-row="" data-columns={columnCount}>
      <div className="grid" style={gridStyle}>
        {dates.map((date) => (
          <MonthGridDayCard
            key={date}
            unit={unit}
            date={date}
            today={today}
            rules={rules}
            calendar={calendar}
            loading={loading}
            density={density}
            overlays={overlays}
            ratePlan={ratePlan}
            ratePlanReady={ratePlanReady}
            ratePlanLoading={ratePlanLoading}
          />
        ))}
      </div>

      {spans.length > 0 ? (
        <div
          className="pointer-events-none absolute inset-0 grid"
          style={gridStyle}
          aria-hidden
        >
          {spans.map((span) => (
            <MonthGridSpanBar
              key={`${span.kind}-${span.id}-${span.startIndex}-${span.endIndex}`}
              span={span}
              barHeightPx={barHeightPx}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
