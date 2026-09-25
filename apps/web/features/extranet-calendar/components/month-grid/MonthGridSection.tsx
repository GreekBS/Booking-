"use client";

import type { AvailabilityRulesRecord, CalendarRecord, RatePlanRecord } from "@/lib/admin/types";
import type { CalendarDensity } from "../../lib/density";
import { getMonthGridTokens } from "../../lib/density";
import type { MonthGridSection as MonthSection } from "../../lib/month-grid-model";
import { MONTH_LABEL_CLASS } from "../../lib/visual-theme";
import type { OverlayToggles } from "../../lib/overlay-types";
import type { RackUnit } from "../../types";
import { MonthGridDayCard } from "./MonthGridDayCard";

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
 * Month of day cards.
 * Responsive auto-fill grid — avoids unusable 10-tiny-cells-per-row on mobile
 * while keeping denser columns on desktop.
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
  const dates = section.rows.flatMap((row) => row.dates);

  return (
    <section className="mb-8" data-month-section={section.key} aria-label={section.label}>
      <h2 className={MONTH_LABEL_CLASS}>{section.label}</h2>

      <div
        className="mt-3 grid"
        style={{
          gridTemplateColumns: "repeat(auto-fill, minmax(4.75rem, 1fr))",
          gap: tokens.gapPx,
        }}
      >
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
    </section>
  );
}
