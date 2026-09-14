"use client";

import { useRef } from "react";
import type { AvailabilityRulesRecord, CalendarRecord } from "@/lib/admin/types";
import type { CalendarDensity } from "../../lib/density";
import type { MonthGridSection } from "../../lib/month-grid-model";
import type { RackPropertyGroup } from "../../types";
import type { OverlayToggles } from "../../lib/overlay-types";
import type { RackUnit } from "../../types";
import { CalendarOpsActionsProvider } from "../../context/CalendarOpsActionsContext";
import {
  TimelineVirtualScrollProvider,
  type TimelineVirtualScrollValue,
} from "../../context/TimelineVirtualScrollContext";
import { MonthGridViewport } from "../month-grid/MonthGridViewport";
import { CalendarWorkspacePanel } from "../workspace/CalendarWorkspacePanel";
import { TodayOperationsPanel } from "../ops/TodayOperationsPanel";
import { CalendarKeyboardBindings } from "../ops/CalendarKeyboardBindings";
import { SelectionDismissBindings } from "../ops/SelectionDismissBindings";

const noopScrollApi: TimelineVirtualScrollValue = {
  scrollToUnitId: () => {},
  scrollToDate: () => {},
};

interface ExtranetCalendarShellProps {
  sections: MonthGridSection[];
  dates: string[];
  today: string;
  selectedPropertyId: string | null;
  selectedUnit: RackUnit | null;
  catalogUnitCount: number;
  groups: RackPropertyGroup[];
  density: CalendarDensity;
  rules: AvailabilityRulesRecord | undefined;
  calendar: CalendarRecord | undefined;
  loading: boolean;
  overlays: OverlayToggles;
  ratePlan: import("@/lib/admin/types").RatePlanRecord | null | undefined;
  ratePlanReady: boolean;
  ratePlanLoading: boolean;
  onLoadMore: () => void;
  onToday: () => void;
  onRefresh: () => void;
  units: RackUnit[];
  selectedUnitId: string | null;
}

export function ExtranetCalendarShell({
  sections,
  dates,
  today,
  selectedPropertyId,
  selectedUnit,
  catalogUnitCount,
  groups,
  density,
  rules,
  calendar,
  loading,
  overlays,
  ratePlan,
  ratePlanReady,
  ratePlanLoading,
  onLoadMore,
  onToday,
  onRefresh,
  units,
  selectedUnitId,
}: ExtranetCalendarShellProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollApiRef = useRef<TimelineVirtualScrollValue>(noopScrollApi);

  return (
    <CalendarOpsActionsProvider>
      <TimelineVirtualScrollProvider
        scrollToUnitId={() => {}}
        scrollToDate={(date) => scrollApiRef.current.scrollToDate(date)}
      >
        <div className="relative flex min-h-0 flex-1 flex-col lg:flex-row">
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <MonthGridViewport
              scrollRef={scrollRef}
              scrollApiRef={scrollApiRef}
              sections={sections}
              today={today}
              selectedPropertyId={selectedPropertyId}
              selectedUnit={selectedUnit}
              catalogUnitCount={catalogUnitCount}
              density={density}
              rules={rules}
              calendar={calendar}
              loading={loading}
              overlays={overlays}
              ratePlan={ratePlan}
              ratePlanReady={ratePlanReady}
              ratePlanLoading={ratePlanLoading}
              onLoadMore={onLoadMore}
            />
            <TodayOperationsPanel groups={groups} today={today} />
          </div>
          <CalendarWorkspacePanel units={units} selectedUnitId={selectedUnitId} />
          <SelectionDismissBindings />
          <CalendarKeyboardBindings
            dates={dates}
            today={today}
            unitId={selectedUnit?.unitId ?? null}
            gridRef={scrollRef}
            onToday={onToday}
            onRefresh={onRefresh}
          />
        </div>
      </TimelineVirtualScrollProvider>
    </CalendarOpsActionsProvider>
  );
}
