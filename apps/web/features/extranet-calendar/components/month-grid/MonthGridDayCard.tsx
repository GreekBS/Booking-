"use client";

import { memo, useMemo } from "react";
import { formatHeaderDate, isWeekendUtc } from "@/features/availability/lib/calendar-utils";
import { resolveCellState } from "@/features/availability/lib/cell-state";
import type { AvailabilityRulesRecord, CalendarRecord, RatePlanRecord } from "@/lib/admin/types";
import { cn } from "@/lib/utils";
import { resolveDayCellState } from "../../lib/cell-availability";
import { buildCellOverlayAria, buildCellOverlayItems } from "../../lib/cell-overlay";
import { hasAnyOverlay, type OverlayToggles } from "../../lib/overlay-types";
import {
  monthGridDayCardClassName,
  monthGridDayPriceClassName,
  monthGridStatusTextClass,
} from "../../lib/month-grid-cell-styles";
import { resolveMonthGridDayPrice } from "../../lib/month-grid-price";
import { DAY_HEADER_WEEKDAY_CLASS } from "../../lib/visual-theme";
import type { CalendarDensity } from "../../lib/density";
import { getMonthGridTokens } from "../../lib/density";
import { useCalendarOpsActions } from "../../context/CalendarOpsActionsContext";
import { useTimelineInteraction } from "../../context/TimelineInteractionContext";
import { CellOverlayLayer } from "../timeline/CellOverlayLayer";
import { TimelineCellContextMenu } from "../timeline/TimelineCellContextMenu";
import type { RackUnit } from "../../types";

interface MonthGridDayCardProps {
  unit: RackUnit;
  date: string;
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

function statusShortLabel(
  cellType: ReturnType<typeof resolveCellState>["type"],
  label: string,
): string {
  if (cellType === "booked") return label.split(" · ")[0] ?? "Booked";
  if (cellType === "held") return "Hold";
  if (cellType === "available") return "";
  if (cellType === "closed") return "Closed";
  return label.length > 18 ? `${label.slice(0, 18)}…` : label;
}

export const MonthGridDayCard = memo(function MonthGridDayCard({
  unit,
  date,
  today,
  rules,
  calendar,
  loading,
  density,
  overlays,
  ratePlan,
  ratePlanReady,
  ratePlanLoading,
}: MonthGridDayCardProps) {
  const tokens = getMonthGridTokens(density);
  const {
    isSelected,
    isFocused,
    isDragging,
    onCellMouseDown,
    onCellMouseEnter,
    onCellClick,
  } = useTimelineInteraction();
  const { openWorkspaceForCell } = useCalendarOpsActions();

  const header = formatHeaderDate(date);
  const cellState = resolveCellState(calendar, date, rules);
  const availabilityState = resolveDayCellState(date, rules);
  const isToday = date === today;
  const isPast = date < today;
  const weekend = isWeekendUtc(date);
  const selected = isSelected(unit.unitId, date);
  const focused = isFocused(unit.unitId, date);
  const rowLoading = loading && !calendar;
  const occupied = cellState.type !== "available" && cellState.type !== "closed";
  const showOverlays = hasAnyOverlay(overlays) && !occupied && !rowLoading;

  const dayPrice = useMemo(
    () =>
      resolveMonthGridDayPrice(ratePlan, date, {
        ready: ratePlanReady,
        loading: ratePlanLoading,
      }),
    [ratePlan, date, ratePlanReady, ratePlanLoading],
  );

  const overlayItems = useMemo(() => {
    if (!showOverlays) return [];
    return buildCellOverlayItems(date, rules, ratePlan, overlays).filter(
      (item) => item.key !== "price",
    );
  }, [showOverlays, date, rules, ratePlan, overlays]);

  const overlayAria = buildCellOverlayAria(overlayItems);
  const statusLabel = occupied ? cellState.label : availabilityState.label;
  const priceAria = dayPrice?.title;
  const ariaLabel = [date, statusLabel, priceAria, overlayAria].filter(Boolean).join(", ");
  const shortStatus = statusShortLabel(cellState.type, cellState.label);

  function handleClick() {
    onCellClick(unit.unitId, date);
    openWorkspaceForCell(unit, date);
  }

  return (
    <TimelineCellContextMenu unit={unit} date={date} calendar={calendar} rules={rules}>
      <button
        type="button"
        tabIndex={focused ? 0 : -1}
        data-calendar-cell="true"
        data-unit-id={unit.unitId}
        data-date={date}
        title={ariaLabel}
        aria-label={ariaLabel}
        aria-selected={selected}
        className={monthGridDayCardClassName({
          cellType: cellState.type,
          availability: availabilityState.availability,
          isToday,
          isPast,
          isWeekend: weekend,
          isSelected: selected,
          isFocused: focused,
          isDragging,
          isLoading: rowLoading,
        })}
        style={{ "--month-card-min-h": `${tokens.cardMinHeightPx}px` } as React.CSSProperties}
        onMouseDown={(e) => {
          if (e.button !== 0) return;
          onCellMouseDown(unit.unitId, date);
        }}
        onMouseEnter={() => onCellMouseEnter(unit.unitId, date)}
        onClick={handleClick}
      >
        <div className="flex items-start justify-between gap-1">
          <span className="text-[18px] font-semibold leading-none tabular-nums">{header.day}</span>
          <span className={cn(DAY_HEADER_WEEKDAY_CLASS, "normal-case")}>{header.dow}</span>
        </div>

        {shortStatus ? (
          <p className={cn("mt-2 line-clamp-2", monthGridStatusTextClass(cellState.type))}>
            {shortStatus}
          </p>
        ) : null}

        <div className="relative mt-auto min-h-[18px] pt-2">
          {dayPrice ? (
            <span
              className={monthGridDayPriceClassName(cellState.type, dayPrice.unavailable)}
              title={dayPrice.title}
              aria-hidden
            >
              {dayPrice.display}
            </span>
          ) : null}

          {overlayItems.length > 0 ? (
            <CellOverlayLayer
              items={overlayItems}
              positionClassName={dayPrice ? "bottom-5 right-1.5" : undefined}
            />
          ) : null}
        </div>
      </button>
    </TimelineCellContextMenu>
  );
});
