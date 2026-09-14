import { cn } from "@/lib/utils";
import {
  BAR_HEIGHT_PX,
  BAR_TOP_OFFSET_PX,
  CELL_WIDTH_PX,
} from "../lib/calendar-utils";
import { getBarVisualConfig } from "../lib/bar-styles";
import type { CalendarSpanItem } from "../lib/span-layout";

interface CalendarSpanBarProps {
  span: CalendarSpanItem;
}

export function CalendarSpanBar({ span }: CalendarSpanBarProps) {
  const width = (span.endIndex - span.startIndex + 1) * CELL_WIDTH_PX - 2;
  const left = span.startIndex * CELL_WIDTH_PX + 1;
  const visual = getBarVisualConfig(span.kind, span.operatorType);
  const Icon = visual.icon;

  return (
    <div
      className={cn(
        "pointer-events-none absolute overflow-hidden",
        visual.className,
        span.checkInEdge ? "rounded-l-md" : "rounded-l-none",
        span.checkOutEdge ? "rounded-r-md" : "rounded-r-none",
      )}
      style={{
        left,
        top: BAR_TOP_OFFSET_PX,
        width: Math.max(width, CELL_WIDTH_PX - 2),
        height: BAR_HEIGHT_PX,
        zIndex: span.zIndex,
      }}
      aria-hidden
    >
      {visual.patternClassName && (
        <div className={cn("absolute inset-0", visual.patternClassName)} aria-hidden />
      )}

      <div className="relative flex h-full items-center gap-0.5 px-1">
        <Icon className={cn("h-3 w-3 shrink-0", visual.iconClassName)} aria-hidden />
        <div className="min-w-0 flex-1 leading-none">
          <div className="truncate text-[9px] font-semibold">{span.preview}</div>
          {span.subPreview && span.kind === "booking" && (
            <div className="truncate text-[8px] capitalize opacity-80">{span.subPreview}</div>
          )}
        </div>
        {span.checkInEdge && span.kind === "booking" && (
          <span
            className="absolute -left-px top-1/2 h-3 w-0.5 -translate-y-1/2 rounded-full bg-emerald-400"
            aria-hidden
          />
        )}
        {span.checkOutEdge && (
          <span
            className="absolute -right-px top-1/2 h-3 w-0.5 -translate-y-1/2 rounded-full bg-rose-400"
            aria-hidden
          />
        )}
      </div>
    </div>
  );
}
