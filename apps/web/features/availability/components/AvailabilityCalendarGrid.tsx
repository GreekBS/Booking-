"use client";

import type { PropertyRecord } from "@/lib/admin/types";
import { CELL_WIDTH_PX, UNIT_COL_WIDTH_PX } from "../lib/calendar-utils";
import { CalendarTimelineHeader } from "./CalendarTimelineHeader";
import { PropertyGroupSection } from "./PropertyGroupSection";
import type { OverlayToggles } from "../types";
import type { AvailabilityRulesRecord, CalendarRecord, RatePlanRecord } from "@/lib/admin/types";

interface AvailabilityCalendarGridProps {
  gridRef: React.RefObject<HTMLDivElement | null>;
  properties: PropertyRecord[];
  propertyFilter: string;
  unitSearch: string;
  dates: string[];
  today: string;
  overlays: OverlayToggles;
  calendars: Record<string, CalendarRecord>;
  loadingUnits: Record<string, boolean>;
  rulesByUnit: Record<string, AvailabilityRulesRecord>;
  ratesByUnit: Record<string, RatePlanRecord | null>;
  isPropertyCollapsed: (propertyId: string) => boolean;
  onTogglePropertyCollapse: (propertyId: string) => void;
  selectionBar?: React.ReactNode;
}

export function AvailabilityCalendarGrid({
  gridRef,
  properties,
  propertyFilter,
  unitSearch,
  dates,
  today,
  overlays,
  calendars,
  loadingUnits,
  rulesByUnit,
  ratesByUnit,
  isPropertyCollapsed,
  onTogglePropertyCollapse,
  selectionBar,
}: AvailabilityCalendarGridProps) {
  const filteredProperties = properties.filter(
    (p) => propertyFilter === "all" || p.id === propertyFilter,
  );

  const todayIndex = dates.indexOf(today);
  const gridMinWidth = UNIT_COL_WIDTH_PX + dates.length * CELL_WIDTH_PX;

  return (
    <div
      ref={gridRef}
      tabIndex={0}
      className="-mx-4 overflow-auto rounded-lg border bg-card outline-none md:-mx-6 lg:-mx-8 max-h-[calc(100vh-12rem)] focus-visible:ring-2 focus-visible:ring-primary/30"
      aria-label="Availability calendar grid. Use arrow keys to navigate, Enter to open, T for today, Escape to clear."
    >
      <div className="relative flex min-h-full flex-col" style={{ minWidth: gridMinWidth }}>
        <CalendarTimelineHeader dates={dates} today={today} />

        <div className="relative flex-1">
          {todayIndex >= 0 && (
            <div
              className="pointer-events-none absolute top-0 z-[5] w-0.5 bg-primary/50"
              style={{
                left: UNIT_COL_WIDTH_PX + todayIndex * CELL_WIDTH_PX + CELL_WIDTH_PX / 2,
                height: "100%",
              }}
              aria-hidden
            />
          )}

          {filteredProperties.map((property) => (
            <PropertyGroupSection
              key={property.id}
              property={property}
              dates={dates}
              today={today}
              collapsed={isPropertyCollapsed(property.id)}
              onToggleCollapse={() => onTogglePropertyCollapse(property.id)}
              unitSearch={unitSearch}
              overlays={overlays}
              calendars={calendars}
              loadingUnits={loadingUnits}
              rulesByUnit={rulesByUnit}
              ratesByUnit={ratesByUnit}
            />
          ))}
        </div>

        {selectionBar}
      </div>
    </div>
  );
}
