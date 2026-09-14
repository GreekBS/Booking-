/**
 * Booking Extranet–inspired operational tokens.
 * Flat, low-decoration, hierarchy through size and contrast — not effects.
 */

/** Canvas behind the day grid */
export const GRID_CANVAS_CLASS = "bg-[#eceff3] dark:bg-muted/20";

/** Left navigation column (property band + unit rack + header corners) */
export const RACK_PANEL_CLASS = "bg-[#f3f4f6] dark:bg-muted/30";

/** Timeline day cells */
export const CELL_SURFACE_CLASS = "bg-white dark:bg-background";

/** Weekend column tint — subtle, flat */
export const WEEKEND_COLUMN_CLASS = "bg-[#f7f8f8] dark:bg-muted/20";

/** Today column tint — flat wash, no gradient */
export const TODAY_COLUMN_CLASS = "bg-[#e8f2fc] dark:bg-primary/10";

/** Today accent line */
export const TODAY_ACCENT_CLASS = "bg-[#0071c2] dark:bg-primary";

/** Month section divider — obvious section boundary */
export const MONTH_DIVIDER_CLASS = "border-l-2 border-[#c5cdd8] dark:border-border";

export const MONTH_SECTION_CLASS =
  "flex items-center bg-white px-5 first:border-l-0 dark:bg-background";

export const MONTH_LABEL_CLASS =
  "text-[14px] font-bold uppercase tracking-[0.1em] text-[#1a1a1a] dark:text-foreground";

export const DAY_HEADER_WEEKDAY_CLASS =
  "text-[11px] font-medium uppercase text-[#6b7280] dark:text-muted-foreground";

export const DAY_HEADER_NUMBER_CLASS =
  "text-[18px] font-semibold leading-none tabular-nums text-[#111827] dark:text-foreground";

/** Workspace property title */
export const PROPERTY_NAME_CLASS =
  "truncate text-[16px] font-semibold leading-tight text-[#111827] dark:text-foreground";

export const PROPERTY_META_CLASS = "text-[12px] text-[#6b7280] dark:text-muted-foreground";

/** Room name in navigation panel */
export const RACK_UNIT_NAME_CLASS =
  "truncate text-[13px] font-medium leading-snug text-[#1f2937] dark:text-foreground";

/** Flat operational chips — no shadow */
export const CHIP_BASE_CLASS =
  "inline-flex items-center rounded border border-[#d1d5db] bg-white px-2 py-0.5 text-[11px] font-medium tabular-nums text-[#374151] dark:border-border dark:bg-muted/40 dark:text-foreground";

export const CHIP_BOOKING_CLASS = "border-[#93c5fd] bg-[#eff6ff] text-[#1d4ed8]";
export const CHIP_HOLD_CLASS = "border-[#fcd34d] bg-[#fffbeb] text-[#92400e]";
export const CHIP_MUTED_CLASS = "border-[#e5e7eb] bg-[#f9fafb] text-[#6b7280]";

/** Reservation bar — hero layer */
export const BAR_BOOKING_CLASS =
  "border border-[#005a9e] bg-[#0071c2] text-white dark:border-[#1967d2] dark:bg-[#1967d2]";

export const BAR_HOLD_CLASS =
  "border-2 border-dashed border-[#b45309] bg-[#fffbeb] text-[#78350f] dark:border-amber-600 dark:bg-amber-950/30 dark:text-amber-100";

export const BAR_OPERATOR_CLASSES = {
  manual: "border border-[#b91c1c] bg-[#dc2626] text-white",
  maintenance: "border border-[#c2410c] bg-[#ea580c] text-white",
  cleaning: "border border-[#6d28d9] bg-[#7c3aed] text-white",
  owner: "border border-[#475569] bg-[#64748b] text-white",
} as const;

export const BAR_TEXT_PRIMARY_CLASS = "truncate text-[13px] font-semibold leading-tight";
export const BAR_TEXT_SECONDARY_CLASS = "truncate text-[11px] font-medium leading-tight opacity-90";

export const PRICE_OVERLAY_CLASS =
  "text-[12px] font-semibold tabular-nums text-[#111827] dark:text-foreground";

export const OVERLAY_META_CLASS =
  "text-[10px] font-medium tabular-nums text-[#6b7280] dark:text-muted-foreground";

export function formatMonthYearUppercase(label: string): string {
  return label.toUpperCase();
}
