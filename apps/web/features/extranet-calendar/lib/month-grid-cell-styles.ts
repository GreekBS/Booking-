import { cn } from "@/lib/utils";
import type { CellVisualType } from "@/features/availability/lib/cell-state";
import type { DayCellAvailability } from "./cell-availability";

export interface MonthGridDayCardStyleInput {
  cellType: CellVisualType;
  availability: DayCellAvailability;
  isToday: boolean;
  isPast: boolean;
  isWeekend: boolean;
  isSelected: boolean;
  isFocused: boolean;
  isDragging: boolean;
  isLoading?: boolean;
}

/** Occupancy surfaces — Talos ops tokens; each state remains visually distinct. */
function occupancySurfaceClass(cellType: CellVisualType): string {
  switch (cellType) {
    case "booked":
      return "border-ops-booking bg-ops-booking text-ops-booking-fg";
    case "held":
      return "border-2 border-dashed border-ops-hold bg-ops-hold-subtle text-ops-hold-fg";
    case "manual":
      return "border-ops-blocked bg-ops-blocked text-ops-blocked-fg";
    case "maintenance":
      return "border-ops-maintenance bg-ops-maintenance text-ops-maintenance-fg";
    case "cleaning":
      return "border-ops-cleaning bg-ops-cleaning text-ops-cleaning-fg";
    case "owner":
      return "border-ops-owner bg-ops-owner text-ops-owner-fg";
    case "closed":
      return "border-border bg-ops-closed text-ops-closed-fg";
    default:
      return "border-border bg-surface text-foreground";
  }
}

/**
 * Today on the month grid — muted border + dot.
 * Must not reuse selection tokens (primary ring / ops-selected fill).
 */
const MONTH_GRID_TODAY_CLASS =
  "border-ops-today-marker/70 before:pointer-events-none before:absolute before:right-2 before:top-2 before:size-1.5 before:rounded-full before:bg-ops-today-marker";

const MONTH_GRID_DAY_PRICE_BASE_CLASS =
  "pointer-events-none absolute bottom-1.5 right-1.5 z-[1] max-w-[calc(100%-8px)] truncate text-right leading-none tabular-nums";

export function monthGridDayPriceClassName(
  cellType: CellVisualType,
  unavailable: boolean,
): string {
  return cn(
    MONTH_GRID_DAY_PRICE_BASE_CLASS,
    unavailable
      ? "text-[10px] font-medium text-muted-foreground"
      : cellType === "held"
        ? "text-[11px] font-semibold text-ops-hold-fg"
        : cellType === "booked" ||
            cellType === "manual" ||
            cellType === "maintenance" ||
            cellType === "cleaning" ||
            cellType === "owner"
          ? "text-[11px] font-semibold text-white/90"
          : "text-[11px] font-semibold text-foreground",
  );
}

export function monthGridDayCardClassName(input: MonthGridDayCardStyleInput): string {
  const {
    cellType,
    availability,
    isToday,
    isPast,
    isWeekend,
    isSelected,
    isFocused,
    isDragging,
    isLoading,
  } = input;

  const occupied = cellType !== "available" && cellType !== "closed";

  return cn(
    "relative flex min-h-[var(--month-card-min-h)] flex-col rounded-md border p-2 text-left transition-colors duration-100",
    // Keyboard DOM focus — dashed offset outline, not selection
    "focus-visible:z-[2] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground/70",
    occupied
      ? occupancySurfaceClass(cellType)
      : availability === "closed"
        ? "border-border bg-ops-closed text-ops-closed-fg"
        : occupancySurfaceClass("available"),
    !occupied && isWeekend && !isPast && "bg-surface-subtle/80",
    // Today (unselected, non-occupied): neutral marker — not selection
    isToday && !isSelected && !occupied && MONTH_GRID_TODAY_CLASS,
    isPast && !occupied && "opacity-75",
    isLoading && "animate-pulse",
    !isPast && !occupied && "hover:border-primary/40 hover:bg-primary-subtle/40",
    isSelected &&
      (isDragging
        ? "z-[2] bg-ops-selected ring-2 ring-inset ring-ops-selected-ring"
        : "z-[1] bg-ops-selected ring-2 ring-inset ring-ops-selected-ring"),
    // React focus (roving tabindex) — dashed outline, distinct from selection
    isFocused && "z-[3] outline outline-2 outline-dashed outline-offset-2 outline-foreground/60",
  );
}

export function monthGridStatusTextClass(cellType: CellVisualType): string {
  if (
    cellType === "booked" ||
    cellType === "manual" ||
    cellType === "maintenance" ||
    cellType === "cleaning" ||
    cellType === "owner"
  ) {
    return "text-[11px] font-medium leading-tight text-white/95";
  }
  if (cellType === "held") {
    return "text-[11px] font-medium leading-tight text-ops-hold-fg";
  }
  return "text-[11px] font-medium leading-tight text-muted-foreground";
}
