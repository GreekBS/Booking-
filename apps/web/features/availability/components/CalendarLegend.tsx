import { cn } from "@/lib/utils";
import { LEGEND_SWATCHES } from "@/features/extranet-calendar/lib/visual-theme";

interface CalendarLegendProps {
  compact?: boolean;
}

/**
 * Legacy availability toolbar legend — ops-* swatches only
 * (aligned with extranet LEGEND_SWATCHES; no Tailwind blue/red inventory colors).
 */
export function CalendarLegend({ compact }: CalendarLegendProps) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground",
        compact && "border-t border-border/60 pt-2",
      )}
    >
      {LEGEND_SWATCHES.map((item) => (
        <span key={item.key} className="inline-flex items-center gap-1" title={item.label}>
          <span className={cn("h-2.5 w-2.5 shrink-0 rounded-sm border", item.className)} aria-hidden />
          {item.label}
        </span>
      ))}
      <span className="inline-flex items-center gap-1" title="Σημάδι ημέρας άφιξης">
        <span className="h-2.5 w-0.5 bg-success" aria-hidden />
        Άφιξη
      </span>
      <span className="inline-flex items-center gap-1" title="Σημάδι ημέρας αναχώρησης">
        <span className="h-2.5 w-0.5 bg-danger" aria-hidden />
        Αναχώρηση
      </span>
    </div>
  );
}
