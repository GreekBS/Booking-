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

function occupancySurfaceClass(cellType: CellVisualType): string {
  switch (cellType) {
    case "booked":
      return "border-[#005a9e] bg-[#0071c2] text-white";
    case "held":
      return "border-2 border-dashed border-[#b45309] bg-[#fffbeb] text-[#78350f]";
    case "manual":
      return "border-[#b91c1c] bg-[#dc2626] text-white";
    case "maintenance":
      return "border-[#c2410c] bg-[#ea580c] text-white";
    case "cleaning":
      return "border-[#6d28d9] bg-[#7c3aed] text-white";
    case "owner":
      return "border-[#475569] bg-[#64748b] text-white";
    case "closed":
      return "border-[#d1d5db] bg-[#f3f4f6] text-[#6b7280]";
    default:
      return "border-[#d1d5db] bg-white text-[#111827] dark:border-border dark:bg-background dark:text-foreground";
  }
}

/**
 * Today on the month grid — neutral border + dot only.
 * Must not reuse selection tokens (#e8f2fc fill, #0071c2 inset ring).
 */
const MONTH_GRID_TODAY_CLASS =
  "border-[#9ca3af] before:pointer-events-none before:absolute before:right-2 before:top-2 before:size-1.5 before:rounded-full before:bg-[#6b7280] dark:border-[#6b7280] dark:before:bg-[#9ca3af]";

const MONTH_GRID_DAY_PRICE_BASE_CLASS =
  "pointer-events-none absolute bottom-1.5 right-1.5 z-[1] max-w-[calc(100%-8px)] truncate text-right leading-none tabular-nums";

export function monthGridDayPriceClassName(
  cellType: CellVisualType,
  unavailable: boolean,
): string {
  return cn(
    MONTH_GRID_DAY_PRICE_BASE_CLASS,
    unavailable
      ? "text-[10px] font-medium text-[#9ca3af] dark:text-muted-foreground"
      : cellType === "held"
        ? "text-[11px] font-semibold text-[#92400e]"
        : cellType === "booked" ||
            cellType === "manual" ||
            cellType === "maintenance" ||
            cellType === "cleaning" ||
            cellType === "owner"
          ? "text-[11px] font-semibold text-white/90"
          : "text-[11px] font-semibold text-[#111827] dark:text-foreground",
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
    "relative flex min-h-[var(--month-card-min-h)] flex-col rounded border p-2 text-left transition-colors duration-100",
  // Keyboard DOM focus — dashed offset outline, not selection blue
    "focus-visible:z-[2] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#374151] dark:focus-visible:outline-[#9ca3af]",
    occupied
      ? occupancySurfaceClass(cellType)
      : availability === "closed"
        ? "border-[#d1d5db] bg-[#f3f4f6] text-[#6b7280]"
        : occupancySurfaceClass("available"),
    !occupied && isWeekend && !isPast && "bg-[#f9fafb] dark:bg-muted/15",
    // Today (unselected, non-occupied): neutral marker — not selection blue
    isToday && !isSelected && !occupied && MONTH_GRID_TODAY_CLASS,
    isPast && !occupied && "opacity-75",
    isLoading && "animate-pulse",
    !isPast && !occupied && "hover:border-[#93c5fd] hover:bg-[#f5f9ff]",
    isSelected &&
      (isDragging
        ? "z-[2] ring-2 ring-inset ring-[#0071c2] bg-[#dbeafe]"
        : "z-[1] bg-[#e8f2fc] ring-2 ring-inset ring-[#0071c2]"),
    // React focus (roving tabindex) — dashed ring, visually distinct from selection
    isFocused && "z-[3] ring-2 ring-dashed ring-offset-2 ring-[#374151] dark:ring-[#9ca3af]",
  );
}

export function monthGridStatusTextClass(cellType: CellVisualType): string {
  if (cellType === "booked" || cellType === "manual" || cellType === "maintenance" || cellType === "cleaning" || cellType === "owner") {
    return "text-[11px] font-medium leading-tight text-white/95";
  }
  if (cellType === "held") {
    return "text-[11px] font-medium leading-tight text-[#92400e]";
  }
  return "text-[11px] font-medium leading-tight text-[#6b7280]";
}
