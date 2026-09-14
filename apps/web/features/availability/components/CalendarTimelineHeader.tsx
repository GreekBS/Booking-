import { cn } from "@/lib/utils";
import {
  CELL_WIDTH_PX,
  UNIT_COL_WIDTH_PX,
  buildMonthSpans,
  formatHeaderDate,
  isoWeekNumber,
  isWeekendUtc,
  isWeekStartUtc,
} from "../lib/calendar-utils";

interface CalendarTimelineHeaderProps {
  dates: string[];
  today: string;
}

export function CalendarTimelineHeader({ dates, today }: CalendarTimelineHeaderProps) {
  const monthSpans = buildMonthSpans(dates);
  const todayIndex = dates.indexOf(today);

  return (
    <div className="sticky top-0 z-20 border-b bg-background shadow-sm">
      <div className="flex border-b border-border/60">
        <div
          className="sticky left-0 z-30 shrink-0 border-r bg-background px-2 py-1 text-[10px] font-medium text-muted-foreground"
          style={{ width: UNIT_COL_WIDTH_PX }}
        >
          Timeline
        </div>
        {monthSpans.map((span) => (
          <div
            key={`${span.label}-${span.startIndex}`}
            className="shrink-0 border-r border-border/60 px-1 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
            style={{ width: span.length * CELL_WIDTH_PX }}
          >
            {span.label}
          </div>
        ))}
      </div>

      <div className="flex border-b border-border/60 bg-muted/20">
        <div
          className="sticky left-0 z-30 shrink-0 border-r bg-muted/20 px-2 py-0.5 text-[9px] text-muted-foreground"
          style={{ width: UNIT_COL_WIDTH_PX }}
        >
          Week
        </div>
        {dates.map((date) => {
          const weekStart = isWeekStartUtc(date);
          return (
            <div
              key={`w-${date}`}
              className={cn(
                "shrink-0 border-r border-border/40 py-0.5 text-center text-[9px] text-muted-foreground",
                weekStart && "border-l-2 border-l-border font-medium",
              )}
              style={{ width: CELL_WIDTH_PX }}
            >
              {weekStart ? `W${isoWeekNumber(date)}` : ""}
            </div>
          );
        })}
      </div>

      <div className="relative flex">
        <div
          className="sticky left-0 z-30 shrink-0 border-r bg-background px-2 py-1 text-[10px] font-medium text-muted-foreground"
          style={{ width: UNIT_COL_WIDTH_PX }}
        >
          Unit
        </div>
        {dates.map((date) => {
          const h = formatHeaderDate(date);
          const isToday = date === today;
          const weekend = isWeekendUtc(date);
          const weekStart = isWeekStartUtc(date);
          return (
            <div
              key={date}
              className={cn(
                "relative shrink-0 border-r border-border/60 px-0.5 py-1 text-center text-[10px]",
                weekend && "bg-muted/35",
                isToday && "bg-primary/15 font-semibold text-primary",
                weekStart && "border-l-2 border-l-border/80",
              )}
              style={{ width: CELL_WIDTH_PX }}
            >
              <div className="text-[9px] text-muted-foreground">{h.dow}</div>
              <div>{h.day}</div>
            </div>
          );
        })}

        {todayIndex >= 0 && (
          <div
            className="pointer-events-none absolute top-0 z-10 w-0.5 bg-primary/70"
            style={{
              left: UNIT_COL_WIDTH_PX + todayIndex * CELL_WIDTH_PX + CELL_WIDTH_PX / 2,
              height: "100%",
            }}
            aria-hidden
          />
        )}
      </div>
    </div>
  );
}
