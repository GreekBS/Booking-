"use client";

import { useRef, useImperativeHandle, forwardRef, useLayoutEffect } from "react";
import { Button } from "@/components/ui/button";
import type { AvailabilityRulesRecord, CalendarRecord, RatePlanRecord } from "@/lib/admin/types";
import { cn } from "@/lib/utils";
import type { CalendarDensity } from "../../lib/density";
import { GRID_CANVAS_CLASS } from "../../lib/visual-theme";
import type { MonthGridSection as MonthSection } from "../../lib/month-grid-model";
import type { OverlayToggles } from "../../lib/overlay-types";
import type { RackUnit } from "../../types";
import type { TimelineVirtualScrollValue } from "../../context/TimelineVirtualScrollContext";
import { TimelineGridEmptyState } from "../timeline/TimelineGridEmptyState";
import { MonthGridSection } from "./MonthGridSection";

interface MonthGridViewportProps {
  sections: MonthSection[];
  today: string;
  selectedPropertyId: string | null;
  selectedUnit: RackUnit | null;
  catalogUnitCount: number;
  density: CalendarDensity;
  rules: AvailabilityRulesRecord | undefined;
  calendar: CalendarRecord | undefined;
  loading: boolean;
  overlays: OverlayToggles;
  ratePlan: RatePlanRecord | null | undefined;
  ratePlanReady: boolean;
  ratePlanLoading: boolean;
  onLoadMore: () => void;
  scrollRef?: React.RefObject<HTMLDivElement | null>;
  scrollApiRef?: React.MutableRefObject<TimelineVirtualScrollValue>;
}

export const MonthGridViewport = forwardRef<HTMLDivElement, MonthGridViewportProps>(
  function MonthGridViewport(
    {
      sections,
      today,
      selectedPropertyId,
      selectedUnit,
      catalogUnitCount,
      density,
      rules,
      calendar,
      loading,
      overlays,
      ratePlan,
      ratePlanReady,
      ratePlanLoading,
      onLoadMore,
      scrollRef: externalScrollRef,
      scrollApiRef,
    },
    forwardedRef,
  ) {
    const internalScrollRef = useRef<HTMLDivElement>(null);
    const scrollRef = externalScrollRef ?? internalScrollRef;

    useImperativeHandle(forwardedRef, () => scrollRef.current as HTMLDivElement);

    useLayoutEffect(() => {
      if (!scrollApiRef) return;
      scrollApiRef.current = {
        scrollToUnitId: () => {},
        scrollToDate: (date: string) => {
          const el = scrollRef.current?.querySelector(
            `[data-calendar-cell="true"][data-date="${date}"]`,
          ) as HTMLElement | null;
          el?.scrollIntoView({ block: "center", behavior: "smooth" });
        },
      };
    }, [scrollApiRef, scrollRef]);

    let emptyVariant: "no-property-selected" | "no-units-in-property" | "no-unit-selected" | null =
      null;
    if (!selectedPropertyId) {
      emptyVariant = "no-property-selected";
    } else if (catalogUnitCount === 0) {
      emptyVariant = "no-units-in-property";
    } else if (!selectedUnit) {
      emptyVariant = "no-unit-selected";
    }

    return (
      <div
        ref={scrollRef}
        className={cn(
          "min-h-0 flex-1 overflow-y-auto outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#0071c2]/30",
          GRID_CANVAS_CLASS,
        )}
        tabIndex={0}
        aria-label="Availability month calendar. Click a day to inspect or drag to select a range."
      >
        <div className="mx-auto w-full max-w-[1200px] px-4 py-4">
          {emptyVariant ? (
            <TimelineGridEmptyState variant={emptyVariant} />
          ) : selectedUnit ? (
            <>
              <div className="mb-4 border-b border-[#d1d5db] pb-3 dark:border-border">
                <h1 className="text-[16px] font-semibold text-[#111827] dark:text-foreground">
                  {selectedUnit.unitName}
                </h1>
                <p className="text-[12px] text-[#6b7280] dark:text-muted-foreground">
                  {selectedUnit.propertyName}
                </p>
              </div>

              {sections.map((section) => (
                <MonthGridSection
                  key={section.key}
                  section={section}
                  unit={selectedUnit}
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

              <div className="flex justify-center pb-6 pt-2">
                <Button type="button" variant="outline" onClick={onLoadMore}>
                  Δείτε περισσότερα
                </Button>
              </div>
            </>
          ) : null}
        </div>
      </div>
    );
  },
);
