"use client";

import { cn } from "@/lib/utils";
import { getBarVisualConfig } from "@/features/availability/lib/bar-styles";
import {
  MONTH_GRID_BAR_BOOKING_CLASS,
  MONTH_GRID_BAR_TEXT_CLASS,
} from "../../lib/visual-theme";
import {
  monthGridBarPositionStyle,
  type MonthGridVisualSpan,
} from "../../lib/month-grid-span-layout";

interface MonthGridSpanBarProps {
  span: MonthGridVisualSpan;
  columnCount: number;
  gapPx: number;
  barHeightPx: number;
}

/**
 * Continuous reservation / hold / operator strip for one month-grid row.
 * Uses absolute % positioning so half-day check-in/out geometry aligns to cell centers.
 * Decorative only — day cells remain the interaction target.
 */
export function MonthGridSpanBar({
  span,
  columnCount,
  gapPx,
  barHeightPx,
}: MonthGridSpanBarProps) {
  const isBooking = span.kind === "booking";
  const visual = getBarVisualConfig(span.kind, span.operatorType);
  const Icon = visual.icon;
  const checkoutStubOnly =
    !span.checkInEdge && span.checkOutEdge && span.startIndex === span.endIndex;
  // Label on true check-in edge, or at the start of a continuation row segment.
  const showLabel =
    !checkoutStubOnly && (span.checkInEdge || span.startIndex === 0);
  const position = monthGridBarPositionStyle(span, columnCount, gapPx);

  return (
    <div
      className={cn(
        "pointer-events-none absolute flex min-w-0 max-w-full items-center overflow-hidden px-1 shadow-sm",
        isBooking ? MONTH_GRID_BAR_BOOKING_CLASS : visual.className,
        span.checkInEdge ? "rounded-l-md" : "rounded-l-none",
        span.checkOutEdge ? "rounded-r-md" : "rounded-r-none",
      )}
      style={{
        left: position.left,
        width: position.width,
        top: "1.65rem",
        height: barHeightPx,
        zIndex: span.zIndex,
      }}
      aria-hidden
    >
      {visual.patternClassName && !isBooking ? (
        <div className={cn("absolute inset-0", visual.patternClassName)} aria-hidden />
      ) : null}

      {showLabel ? (
        <div className="relative flex min-w-0 flex-1 items-center gap-1 overflow-hidden">
          <Icon
            className={cn(
              "h-3 w-3 shrink-0 opacity-90",
              isBooking
                ? "text-[hsl(var(--calendar-booking-bar-fg))]"
                : visual.iconClassName,
            )}
            aria-hidden
          />
          <span className={cn(MONTH_GRID_BAR_TEXT_CLASS, "min-w-0 truncate")}>
            {span.preview}
          </span>
        </div>
      ) : null}
    </div>
  );
}
