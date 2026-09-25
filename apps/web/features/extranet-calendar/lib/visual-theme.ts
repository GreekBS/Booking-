/**
 * Talos Operations Calendar visual tokens.
 * Semantic classes mapped to Phase 1 design tokens — not Booking.com hex.
 * Flat, low-decoration; hierarchy through contrast, not effects.
 */

/** Canvas behind the day grid */
export const GRID_CANVAS_CLASS = "bg-background";

/** Left navigation / rack panel (timeline legacy) */
export const RACK_PANEL_CLASS = "bg-surface-subtle";

/** Timeline day cells */
export const CELL_SURFACE_CLASS = "bg-surface";

/** Weekend column tint — subtle */
export const WEEKEND_COLUMN_CLASS = "bg-surface-subtle/70";

/** Today column tint — subtle wash, not selection */
export const TODAY_COLUMN_CLASS = "bg-primary-subtle/50";

/** Today accent line */
export const TODAY_ACCENT_CLASS = "bg-primary";

/** Month section divider */
export const MONTH_DIVIDER_CLASS = "border-l-2 border-border-strong";

export const MONTH_SECTION_CLASS =
  "flex items-center bg-surface px-5 first:border-l-0";

export const MONTH_LABEL_CLASS =
  "text-[13px] font-semibold uppercase tracking-[0.12em] text-foreground";

export const DAY_HEADER_WEEKDAY_CLASS =
  "text-[10px] font-medium uppercase text-muted-foreground";

export const DAY_HEADER_NUMBER_CLASS =
  "text-[18px] font-semibold leading-none tabular-nums text-foreground";

/** Workspace property title */
export const PROPERTY_NAME_CLASS =
  "truncate text-[16px] font-semibold leading-tight text-foreground";

export const PROPERTY_META_CLASS = "text-[12px] text-muted-foreground";

/** Room name in navigation panel */
export const RACK_UNIT_NAME_CLASS =
  "truncate text-[13px] font-medium leading-snug text-foreground";

/** Flat operational chips */
export const CHIP_BASE_CLASS =
  "inline-flex items-center rounded-md border border-border bg-surface px-2 py-0.5 text-[11px] font-medium tabular-nums text-foreground";

export const CHIP_BOOKING_CLASS =
  "border-ops-booking/30 bg-primary-subtle text-ops-booking";
export const CHIP_HOLD_CLASS =
  "border-ops-hold/40 bg-ops-hold-subtle text-ops-hold-fg";
export const CHIP_MUTED_CLASS =
  "border-border bg-surface-subtle text-muted-foreground";

/** Reservation bar — hero layer (timeline) */
export const BAR_BOOKING_CLASS =
  "border border-ops-booking bg-ops-booking text-ops-booking-fg";

export const BAR_HOLD_CLASS =
  "border-2 border-dashed border-ops-hold bg-ops-hold-subtle text-ops-hold-fg";

export const BAR_OPERATOR_CLASSES = {
  manual: "border border-ops-blocked bg-ops-blocked text-ops-blocked-fg",
  maintenance:
    "border border-ops-maintenance bg-ops-maintenance text-ops-maintenance-fg",
  cleaning: "border border-ops-cleaning bg-ops-cleaning text-ops-cleaning-fg",
  owner: "border border-ops-owner bg-ops-owner text-ops-owner-fg",
} as const;

export const BAR_TEXT_PRIMARY_CLASS = "truncate text-[13px] font-semibold leading-tight";
export const BAR_TEXT_SECONDARY_CLASS = "truncate text-[11px] font-medium leading-tight opacity-90";

export const PRICE_OVERLAY_CLASS =
  "text-[12px] font-semibold tabular-nums text-foreground";

export const OVERLAY_META_CLASS =
  "text-[10px] font-medium tabular-nums text-muted-foreground";

/** Compact legend swatch helpers */
export const LEGEND_SWATCHES = [
  { key: "available", label: "Available", className: "border border-border bg-surface" },
  { key: "booked", label: "Booked", className: "bg-ops-booking" },
  { key: "hold", label: "Hold", className: "border-2 border-dashed border-ops-hold bg-ops-hold-subtle" },
  { key: "manual", label: "Blocked", className: "bg-ops-blocked" },
  { key: "maintenance", label: "Maintenance", className: "bg-ops-maintenance" },
  { key: "cleaning", label: "Cleaning", className: "bg-ops-cleaning" },
  { key: "owner", label: "Owner", className: "bg-ops-owner" },
  { key: "closed", label: "Closed", className: "bg-ops-closed" },
] as const;

export function formatMonthYearUppercase(label: string): string {
  return label.toUpperCase();
}
