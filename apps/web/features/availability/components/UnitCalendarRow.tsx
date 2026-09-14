"use client";

import { useEffect, useMemo, useState } from "react";
import { Ban } from "lucide-react";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  CELL_HEIGHT_PX,
  CELL_WIDTH_PX,
  UNIT_COL_WIDTH_PX,
  isWeekendUtc,
  isWeekStartUtc,
} from "../lib/calendar-utils";
import {
  backgroundCellClassName,
  resolveBackgroundCellState,
} from "../lib/cell-state";
import { getNightlyRate } from "../lib/nightly-rates";
import { buildCalendarSpans } from "../lib/span-layout";
import { CalendarSpanBar } from "./CalendarSpanBar";
import { CalendarDayCell } from "./CalendarDayCell";
import { CellHoverCardContent } from "./CellHoverCardContent";
import { RestrictionOverlayRows } from "./RestrictionOverlayRows";
import { UnitOccupancyIndicator } from "./UnitOccupancyIndicator";
import { useAvailabilityInteraction } from "../context/AvailabilityInteractionContext";
import type { UnitMeta, OverlayToggles } from "../types";
import { hasAnyRestrictionOverlay } from "../types";
import type { AvailabilityRulesRecord, CalendarRecord, RatePlanRecord } from "@/lib/admin/types";

interface UnitCalendarRowProps {
  meta: UnitMeta;
  dates: string[];
  today: string;
  calendar: CalendarRecord | undefined;
  rules: AvailabilityRulesRecord | undefined;
  ratePlan: RatePlanRecord | null | undefined;
  loading: boolean;
  overlays: OverlayToggles;
}

export function UnitCalendarRow({
  meta,
  dates,
  today,
  calendar,
  rules,
  ratePlan,
  loading,
  overlays,
}: UnitCalendarRowProps) {
  const {
    isDragging,
    isSelected,
    isFocused,
    onCellMouseDown,
    onCellMouseEnter,
    onCellClick,
    setFocus,
  } = useAvailabilityInteraction();

  const rowLoading = loading && !calendar;
  const [holdTick, setHoldTick] = useState(0);

  const hasHolds = Boolean(calendar?.holds.some((h) => h.status === "active"));

  useEffect(() => {
    if (!hasHolds) return;
    const id = window.setInterval(() => setHoldTick((t) => t + 1), 30_000);
    return () => window.clearInterval(id);
  }, [hasHolds]);

  const spans = useMemo(
    () => buildCalendarSpans(calendar, dates),
    [calendar, dates, holdTick],
  );

  const gridWidth = dates.length * CELL_WIDTH_PX;
  const showRestrictionRows = hasAnyRestrictionOverlay(overlays) && rules;

  return (
    <div className="group/row transition-colors hover:bg-muted/[0.03]">
      <div className="relative flex border-b">
        <div
          className="sticky left-0 z-10 shrink-0 border-r bg-background px-2 py-1.5 text-xs transition-colors group-hover/row:bg-muted/20"
          style={{ width: UNIT_COL_WIDTH_PX, minHeight: CELL_HEIGHT_PX }}
        >
          <div className="truncate font-medium leading-tight">{meta.unitName}</div>
          <UnitOccupancyIndicator calendar={calendar} today={today} loadedDates={dates} />
          {rowLoading && <Skeleton className="mt-1 h-1.5 w-full" />}
        </div>

        <div className="relative shrink-0" style={{ width: gridWidth, minHeight: CELL_HEIGHT_PX }}>
          <div className="relative flex">
            {dates.map((date) => {
              const background = resolveBackgroundCellState(calendar, date, rules);
              const selected = isSelected(meta.unitId, date);
              const focused = isFocused(meta.unitId, date);
              const isToday = date === today;
              const isPast = date < today;
              const weekend = isWeekendUtc(date);
              const weekStart = isWeekStartUtc(date);
              const nightly = getNightlyRate(ratePlan, date);

              const cellButton = (
                <button
                  type="button"
                  tabIndex={focused ? 0 : -1}
                  data-calendar-cell="true"
                  data-unit-id={meta.unitId}
                  data-date={date}
                  className={cn(
                    backgroundCellClassName(
                      background.type,
                      isToday,
                      selected,
                      background.hasOccupancy,
                      isPast,
                      focused,
                      isDragging && selected,
                    ),
                    weekend && background.type === "available" && "bg-muted/20",
                    weekStart && "border-l-2 border-l-border/60",
                    "transition-[filter,background-color] hover:brightness-[0.98] dark:hover:brightness-110",
                  )}
                  style={{ width: CELL_WIDTH_PX, minWidth: CELL_WIDTH_PX, height: CELL_HEIGHT_PX }}
                  onMouseDown={(e) => {
                    if (e.button !== 0) return;
                    onCellMouseDown(meta.unitId, date);
                  }}
                  onMouseEnter={() => onCellMouseEnter(meta.unitId, date)}
                  onFocus={() => setFocus({ unitId: meta.unitId, date })}
                  onClick={() => void onCellClick(meta, date)}
                >
                  {background.type === "closed" && (
                    <Ban
                      className="absolute left-0.5 top-0.5 h-2.5 w-2.5 text-muted-foreground/70"
                      aria-hidden
                    />
                  )}
                  {overlays.price && !rowLoading && background.type === "available" && (
                    <span className="truncate text-[9px] tabular-nums text-muted-foreground">
                      {nightly?.amount ?? "—"}
                    </span>
                  )}
                </button>
              );

              return (
                <HoverCard key={date} openDelay={280} closeDelay={80}>
                  <CalendarDayCell meta={meta} date={date} calendar={calendar} rules={rules}>
                    <HoverCardTrigger asChild>{cellButton}</HoverCardTrigger>
                  </CalendarDayCell>
                  <HoverCardContent side="top" align="center" className="w-72">
                    <CellHoverCardContent
                      date={date}
                      unitName={meta.unitName}
                      propertyName={meta.propertyName}
                      calendar={calendar}
                      rules={rules}
                      ratePlan={ratePlan}
                    />
                  </HoverCardContent>
                </HoverCard>
              );
            })}
          </div>

          {spans.map((span) => (
            <CalendarSpanBar key={`${span.kind}-${span.id}`} span={span} />
          ))}
        </div>
      </div>

      {showRestrictionRows && (
        <RestrictionOverlayRows rules={rules} dates={dates} overlays={overlays} />
      )}
    </div>
  );
}
