"use client";

import { useRef, useImperativeHandle, forwardRef, useLayoutEffect } from "react";
import { Button } from "@/components/ui/button";
import type { AvailabilityRulesRecord, CalendarRecord, RatePlanRecord } from "@/lib/admin/types";
import { elCommon } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { CalendarDensity } from "../../lib/density";
import { GRID_CANVAS_CLASS, PROPERTY_META_CLASS, PROPERTY_NAME_CLASS } from "../../lib/visual-theme";
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
  /** Adaptive column count from container measurement. */
  columns: number;
  /** Callback ref for the content-width measure node. */
  measureRef: (node: HTMLElement | null) => void;
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
      columns,
      measureRef,
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
        scrollToDate: (date: string, options?: ScrollIntoViewOptions) => {
          const el = scrollRef.current?.querySelector(
            `[data-calendar-cell="true"][data-date="${date}"]`,
          ) as HTMLElement | null;
          el?.scrollIntoView(
            options ?? {
              block: "center",
              behavior: "smooth",
            },
          );
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
          "min-h-0 flex-1 overflow-y-auto outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/30",
          GRID_CANVAS_CLASS,
        )}
        tabIndex={0}
        aria-label="Μηνιαίο ημερολόγιο διαθεσιμότητας. Κλικ για προβολή ή σύρσιμο για επιλογή εύρους."
        data-month-grid-columns={columns}
      >
        <div className="mx-auto w-full min-w-0 max-w-full px-3 py-4 sm:px-4">
          {/* Measure node: content box available to grid tracks (inside horizontal padding). */}
          <div ref={measureRef} className="w-full min-w-0" data-month-grid-measure="">
            {emptyVariant ? (
              <TimelineGridEmptyState variant={emptyVariant} />
            ) : selectedUnit ? (
              <>
                <div className="mb-4 border-b border-border pb-3">
                  <h1 className={PROPERTY_NAME_CLASS}>{selectedUnit.unitName}</h1>
                  <p className={PROPERTY_META_CLASS}>{selectedUnit.propertyName}</p>
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
                    columns={columns}
                  />
                ))}

                <div className="flex justify-center pb-6 pt-2">
                  <Button type="button" variant="outline" size="sm" onClick={onLoadMore}>
                    {elCommon.loadMoreMonths}
                  </Button>
                </div>
              </>
            ) : null}
          </div>
        </div>
      </div>
    );
  },
);
