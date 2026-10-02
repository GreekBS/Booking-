"use client";

import { useMemo } from "react";
import type { AvailabilityRulesRecord, CalendarRecord, RatePlanRecord } from "@/lib/admin/types";
import type { CalendarDensity } from "../../lib/density";
import { getMonthGridTokens } from "../../lib/density";
import {
  MONTH_GRID_COLUMNS,
  type MonthGridSection as MonthSection,
} from "../../lib/month-grid-model";
import { buildMonthGridVisualSpans } from "../../lib/month-grid-span-layout";
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
 * Month of day cards rendered as deterministic MONTH_GRID_COLUMNS-day rows
 * with a continuous reservation-bar overlay per row.
 * Every row uses the same 9-column grid so partial last rows do not stretch.
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
    <section className="mb-8 min-w-0" data-month-section={section.key} aria-label={section.label}>
      <h2 className={MONTH_LABEL_CLASS}>{section.label}</h2>

      <div className="mt-3 min-w-0 space-y-2">
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
  const spans = useMemo(() => buildMonthGridVisualSpans(calendar, dates), [calendar, dates]);

  // Fixed column contract: always MONTH_GRID_COLUMNS tracks so trailing dates
  // occupy leading columns only and never stretch across the row.
  const gridStyle = {
    gridTemplateColumns: `repeat(${MONTH_GRID_COLUMNS}, minmax(0, 1fr))`,
    gap: gapPx,
  } as const;

  return (
    <div
      className="relative min-w-0 w-full"
      data-month-grid-row=""
      data-columns={MONTH_GRID_COLUMNS}
    >
      <div className="grid min-w-0 w-full" style={gridStyle}>
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
        <div className="pointer-events-none absolute inset-0 min-w-0" aria-hidden>
          {spans.map((span) => (
            <MonthGridSpanBar
              key={`${span.kind}-${span.id}-${span.startIndex}-${span.endIndex}`}
              span={span}
              columnCount={MONTH_GRID_COLUMNS}
              gapPx={gapPx}
              barHeightPx={barHeightPx}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
