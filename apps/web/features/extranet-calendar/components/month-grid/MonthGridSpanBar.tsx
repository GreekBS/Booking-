"use client";

import { cn } from "@/lib/utils";
import { getBarVisualConfig } from "@/features/availability/lib/bar-styles";
import type { CalendarSpanItem } from "@/features/availability/lib/span-layout";
import {
  MONTH_GRID_BAR_BOOKING_CLASS,
  MONTH_GRID_BAR_TEXT_CLASS,
} from "../../lib/visual-theme";

interface MonthGridSpanBarProps {
  span: CalendarSpanItem;
  barHeightPx: number;
}

/**
 * Continuous reservation / hold / operator strip for one month-grid row.
 * Positioned in a mirrored CSS grid so columns align with day cards (including gap).
 * Decorative only — day cells remain the interaction target.
 */
export function MonthGridSpanBar({ span, barHeightPx }: MonthGridSpanBarProps) {
  const isBooking = span.kind === "booking";
  const visual = getBarVisualConfig(span.kind, span.operatorType);
  const Icon = visual.icon;
  // Label on true check-in edge, or at the start of a continuation row segment.
  const showLabel = span.checkInEdge || span.startIndex === 0;

  return (
    <div
      className={cn(
        "pointer-events-none relative mx-0.5 flex min-w-0 items-center overflow-hidden px-1.5 shadow-sm",
        isBooking ? MONTH_GRID_BAR_BOOKING_CLASS : visual.className,
        span.checkInEdge ? "rounded-l-md" : "rounded-l-none",
        span.checkOutEdge ? "rounded-r-md" : "rounded-r-none",
      )}
      style={{
        gridColumn: `${span.startIndex + 1} / ${span.endIndex + 2}`,
        gridRow: 1,
        height: barHeightPx,
        alignSelf: "center",
        marginTop: "1.65rem",
        zIndex: span.zIndex,
      }}
      aria-hidden
    >
      {visual.patternClassName && !isBooking ? (
        <div className={cn("absolute inset-0", visual.patternClassName)} aria-hidden />
      ) : null}

      {showLabel ? (
        <div className="relative flex min-w-0 flex-1 items-center gap-1">
          <Icon
            className={cn(
              "h-3 w-3 shrink-0 opacity-90",
              isBooking
                ? "text-[hsl(var(--calendar-booking-bar-fg))]"
                : visual.iconClassName,
            )}
            aria-hidden
          />
          <span className={MONTH_GRID_BAR_TEXT_CLASS}>{span.preview}</span>
        </div>
      ) : null}
    </div>
  );
}
