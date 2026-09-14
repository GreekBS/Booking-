import { cn } from "@/lib/utils";

const LEGEND_ITEMS = [
  { cls: "border border-blue-700 bg-blue-600/90", label: "Booked (bar)" },
  { cls: "border-2 border-dashed border-amber-700 bg-amber-500/85", label: "Hold (bar)" },
  { cls: "border border-red-700 bg-red-500/90", label: "Block (bar)" },
  { cls: "border border-orange-700 bg-orange-500/90", label: "Maintenance" },
  { cls: "border border-violet-700 bg-violet-500/90", label: "Cleaning" },
  { cls: "border border-slate-600 bg-slate-500/90", label: "Owner" },
  { cls: "bg-muted border-border", label: "Closed arrival" },
] as const;

interface CalendarLegendProps {
  compact?: boolean;
}

export function CalendarLegend({ compact }: CalendarLegendProps) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground",
        compact && "border-t border-border/60 pt-2",
      )}
    >
      {LEGEND_ITEMS.map((item) => (
        <span key={item.label} className="inline-flex items-center gap-1" title={item.label}>
          <span className={cn("h-2.5 w-2.5 shrink-0 rounded-sm border", item.cls)} aria-hidden />
          {item.label}
        </span>
      ))}
      <span className="inline-flex items-center gap-1" title="Check-in day marker">
        <span className="h-2.5 w-0.5 bg-emerald-600" aria-hidden />
        Check-in
      </span>
      <span className="inline-flex items-center gap-1" title="Check-out day marker">
        <span className="h-2.5 w-0.5 bg-rose-600" aria-hidden />
        Check-out
      </span>
    </div>
  );
}
