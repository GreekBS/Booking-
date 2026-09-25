import type {
  AvailabilityRulesRecord,
  CalendarRecord,
  OperatorBlockType,
} from "@/lib/admin/types";
import { OPERATOR_BLOCK_TYPES } from "@/lib/admin/types";
import { dateInStayPeriod, dayOfWeekUtc } from "./calendar-utils";

export type CellVisualType =
  | "available"
  | "booked"
  | "held"
  | "manual"
  | "maintenance"
  | "cleaning"
  | "owner"
  | "closed";

export type BackgroundCellType = "available" | "closed";

export interface CellState {
  type: CellVisualType;
  label: string;
  bookingId?: string;
  holdId?: string;
  blockId?: string;
  checkInEdge?: boolean;
  checkOutEdge?: boolean;
}

export interface BackgroundCellState {
  type: BackgroundCellType;
  label: string;
  hasOccupancy: boolean;
}

const OPERATOR_SET = new Set<string>(OPERATOR_BLOCK_TYPES);

function isActiveOperatorBlock(block: CalendarRecord["blocks"][0]): boolean {
  return block.status === "active" && OPERATOR_SET.has(block.blockType);
}

function isOccupied(calendar: CalendarRecord | undefined, date: string): boolean {
  if (!calendar) return false;
  const booked = calendar.bookings.some(
    (b) => b.status !== "cancelled" && dateInStayPeriod(date, b.checkIn, b.checkOut),
  );
  if (booked) return true;
  const held = calendar.holds.some(
    (h) => h.status === "active" && dateInStayPeriod(date, h.checkIn, h.checkOut),
  );
  if (held) return true;
  return calendar.blocks.some(
    (b) => isActiveOperatorBlock(b) && dateInStayPeriod(date, b.checkIn, b.checkOut),
  );
}

/** Interaction + tooltip state (unchanged business priority). */
export function resolveCellState(
  calendar: CalendarRecord | undefined,
  date: string,
  rules?: AvailabilityRulesRecord,
): CellState {
  const booking = calendar?.bookings.find(
    (b) => b.status !== "cancelled" && dateInStayPeriod(date, b.checkIn, b.checkOut),
  );
  if (booking) {
    return {
      type: "booked",
      label: `${booking.guestName} · ${booking.status}`,
      bookingId: booking.id,
      checkInEdge: date === booking.checkIn,
      checkOutEdge: date === booking.checkOut,
    };
  }

  const hold = calendar?.holds.find(
    (h) => h.status === "active" && dateInStayPeriod(date, h.checkIn, h.checkOut),
  );
  if (hold) {
    return {
      type: "held",
      label: `Hold · expires ${new Date(hold.expiresAt).toLocaleString()}`,
      holdId: hold.id,
      checkInEdge: date === hold.checkIn,
      checkOutEdge: date === hold.checkOut,
    };
  }

  const block = calendar?.blocks.find(
    (b) => isActiveOperatorBlock(b) && dateInStayPeriod(date, b.checkIn, b.checkOut),
  );
  if (block) {
    const type = block.blockType as OperatorBlockType;
    return {
      type: type === "manual" ? "manual" : type,
      label: block.reason ?? block.blockType,
      blockId: block.id,
      checkInEdge: date === block.checkIn,
      checkOutEdge: date === block.checkOut,
    };
  }

  if (rules && rules.checkInDays.length > 0 && !rules.checkInDays.includes(dayOfWeekUtc(date))) {
    return { type: "closed", label: "Closed to arrival" };
  }

  return { type: "available", label: "Available" };
}

/** Background layer only — availability/restrictions, not occupancy fill. */
export function resolveBackgroundCellState(
  calendar: CalendarRecord | undefined,
  date: string,
  rules?: AvailabilityRulesRecord,
): BackgroundCellState {
  const hasOccupancy = isOccupied(calendar, date);

  if (rules && rules.checkInDays.length > 0 && !rules.checkInDays.includes(dayOfWeekUtc(date))) {
    return { type: "closed", label: "Closed to arrival", hasOccupancy };
  }

  return { type: "available", label: "Available", hasOccupancy };
}

export function backgroundCellClassName(
  type: BackgroundCellType,
  isToday: boolean,
  isSelected: boolean,
  hasOccupancy: boolean,
  isPast: boolean,
  isFocused = false,
  isDragging = false,
): string {
  const base =
    "relative flex h-9 min-w-[36px] flex-col items-center justify-end border-r border-b px-0.5 pb-0.5 text-[10px] transition-all duration-150 ";
  const selected = isSelected
    ? isDragging
      ? "ring-2 ring-inset ring-primary bg-primary/20 z-[2] "
      : "ring-2 ring-inset ring-primary/60 bg-primary/10 z-[1] "
    : "";
  const focused = isFocused
    ? "outline outline-2 outline-offset-[-2px] outline-primary shadow-sm z-[3] "
    : "";
  const today = isToday ? "font-semibold ring-1 ring-inset ring-primary/25 " : "";
  const past = isPast ? "opacity-70 " : "";

  if (type === "closed") {
    return (
      base +
      selected +
      focused +
      today +
      past +
      "bg-muted/50 text-muted-foreground " +
      (hasOccupancy ? "bg-[repeating-linear-gradient(135deg,transparent,transparent_4px,rgba(0,0,0,0.04)_4px,rgba(0,0,0,0.04)_5px)] " : "")
    );
  }

  return (
    base +
    selected +
    focused +
    today +
    past +
    "bg-background hover:bg-muted/50 " +
    (hasOccupancy
      ? "bg-[repeating-linear-gradient(135deg,transparent,transparent_5px,rgba(0,0,0,0.03)_5px,rgba(0,0,0,0.03)_6px)] "
      : "")
  );
}

/** @deprecated Prefer month-grid / timeline semantic helpers; kept for legend compatibility. */
export function cellClassName(type: CellVisualType, isToday: boolean, isSelected: boolean): string {
  const base =
    "relative flex h-9 min-w-[36px] flex-col items-center justify-center border-r border-b text-[10px] transition-colors ";
  const selected = isSelected ? "ring-2 ring-inset ring-ops-selected-ring z-[1] " : "";
  const today = isToday ? "font-bold " : "";

  switch (type) {
    case "booked":
      return base + selected + today + "bg-ops-booking text-ops-booking-fg";
    case "held":
      return (
        base +
        selected +
        today +
        "border-dashed border-ops-hold bg-ops-hold-subtle text-ops-hold-fg"
      );
    case "manual":
      return base + selected + today + "bg-ops-blocked text-ops-blocked-fg";
    case "maintenance":
      return base + selected + today + "bg-ops-maintenance text-ops-maintenance-fg";
    case "cleaning":
      return base + selected + today + "bg-ops-cleaning text-ops-cleaning-fg";
    case "owner":
      return base + selected + today + "bg-ops-owner text-ops-owner-fg";
    case "closed":
      return (
        base +
        selected +
        today +
        "bg-ops-closed text-ops-closed-fg line-through decoration-muted-foreground/40"
      );
    default:
      return base + selected + today + "bg-surface hover:bg-primary-subtle/40";
  }
}
