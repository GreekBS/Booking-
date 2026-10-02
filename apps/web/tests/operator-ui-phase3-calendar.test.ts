import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildMonthGridModel,
  formatPeriodLabel,
  shiftMonthIso,
  startOfMonthIso,
} from "@/features/extranet-calendar/lib/month-grid-model";
import { monthGridDayCardClassName } from "@/features/extranet-calendar/lib/month-grid-cell-styles";
import { LEGEND_SWATCHES } from "@/features/extranet-calendar/lib/visual-theme";
import { formatHeaderDate } from "@/features/availability/lib/calendar-utils";
import { elCommon, elWeekdaysInitials } from "@/lib/i18n";
const root = join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

describe("Talos operator Phase 3 — Operations Calendar", () => {
  it("ops bar uses Active Property chip and unit selector without density toggle", () => {
    const bar = read("features/extranet-calendar/components/shell/CalendarOpsBar.tsx");
    expect(bar).toContain("propertyName");
    expect(bar).toContain('aria-label="Επιλογή μονάδας"');
    expect(bar).toContain('aria-label="Πλοήγηση περιόδου"');
    expect(bar).toContain('aria-label="Προηγούμενος μήνας"');
    expect(bar).toContain('aria-label="Επόμενος μήνας"');
    expect(bar).toContain("LEGEND_SWATCHES");
    expect(bar).not.toContain("onSelectedPropertyChange");
    expect(bar).not.toContain("selectedPropertyId");
    expect(bar).not.toContain("Συμπαγές");
    expect(bar).not.toContain("Άνετο");
    expect(bar).not.toContain("onDensityChange");
    expect(bar).not.toContain("density:");
  });

  it("page wires Active Property and invalidates on property switch", () => {
    const page = read("features/extranet-calendar/ExtranetCalendarPage.tsx");
    expect(page).toContain("useActiveProperty");
    expect(page).toContain("propertyName={propertyName}");
    expect(page).toContain("onPrevPeriod");
    expect(page).toContain("onNextPeriod");
    expect(page).toContain("shiftMonthIso");
    expect(page).toContain("prevPropertyIdRef");
    expect(page).not.toContain("onSelectedPropertyChange");
    expect(page).not.toContain("properties={properties}");
    expect(page).toContain("const density = DEFAULT_DENSITY");
    expect(page).not.toContain("useState<CalendarDensity>");
    expect(page).not.toContain("onDensityChange");
    expect(page).not.toContain("setDensity");
  });

  it("Availability density is permanently compact", () => {
    const densitySrc = read("features/extranet-calendar/lib/density.ts");
    expect(densitySrc).toContain('DEFAULT_DENSITY: CalendarDensity = "compact"');
    expect(densitySrc).toContain("minCellWidthPx: 64");
    expect(densitySrc).toContain("minCellWidthPx: 72"); // comfortable tokens retained
  });

  it("month-grid localization uses Greek load-more and weekday initials", () => {
    const viewport = read("features/extranet-calendar/components/month-grid/MonthGridViewport.tsx");
    expect(viewport).toContain("elCommon.loadMoreMonths");
    expect(viewport).not.toContain("Load more months");
    expect(elCommon.loadMoreMonths).toBe("Φόρτωση περισσότερων μηνών");

    expect([...elWeekdaysInitials]).toEqual(["Κυ", "Δε", "Τρ", "Τε", "Πε", "Πα", "Σα"]);
    // Mon–Sun display order for a week starting 2026-10-05 (Monday).
    expect(
      ["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09", "2026-10-10", "2026-10-11"].map(
        (iso) => formatHeaderDate(iso).dow,
      ),
    ).toEqual(["Δε", "Τρ", "Τε", "Πε", "Πα", "Σα", "Κυ"]);
    expect(formatHeaderDate("2026-10-05").dow).not.toMatch(/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)/i);

    const utils = read("features/availability/lib/calendar-utils.ts");
    expect(utils).toContain("elWeekdaysInitials");
    expect(utils).not.toContain('weekday: "short"');
  });

  it("month section uses adaptive columns with span overlay", () => {
    const section = read("features/extranet-calendar/components/month-grid/MonthGridSection.tsx");
    expect(section).toContain("chunkDates(section.dates, columns)");
    expect(section).toContain("buildMonthGridVisualSpans");
    expect(section).toContain("MonthGridSpanBar");
    expect(section).toContain("data-month-grid-row");
    expect(section).toContain("minmax(0, 1fr)");
    expect(section).not.toContain("auto-fill");
    expect(section).not.toContain("4.75rem");
  });

  it("day cells use Talos ops semantic tokens with distinct Today / Selected / Focus", () => {
    const styles = read("features/extranet-calendar/lib/month-grid-cell-styles.ts");
    // Booked nights are neutral; reservation bars carry booking color.
    expect(styles).toContain('case "booked":');
    expect(styles).toContain("border-border bg-surface text-foreground");
    expect(styles).not.toMatch(/case "booked":[\s\S]*?bg-ops-booking text-ops-booking-fg/);
    expect(styles).toContain("bg-ops-hold-subtle");
    expect(styles).toContain("bg-ops-blocked");
    expect(styles).toContain("bg-ops-maintenance");
    expect(styles).toContain("bg-ops-cleaning");
    expect(styles).toContain("bg-ops-owner");
    expect(styles).toContain("bg-ops-closed");
    expect(styles).toContain("ops-today-marker");
    expect(styles).toContain("ops-selected");
    expect(styles).toContain("outline-dashed");
    expect(styles).not.toMatch(/#[0-9a-fA-F]{3,8}/);
    expect(styles).not.toContain("bg-blue-");
  });

  it("visual theme maps to semantic tokens without Booking.com hex", () => {
    const theme = read("features/extranet-calendar/lib/visual-theme.ts");
    expect(theme).toContain("ops-booking");
    expect(theme).toContain("ops-booking-subtle");
    expect(theme).toContain("ops-hold");
    expect(theme).toContain("LEGEND_SWATCHES");
    expect(theme).toContain("MONTH_GRID_BAR_BOOKING_CLASS");
    expect(theme).toContain("calendar-booking-bar-bg");
    expect(theme).not.toMatch(/#[0-9a-fA-F]{3,8}/);
    expect(theme).not.toContain("003580");
    // Booking chips (non-month-grid) must not borrow CTA primary-subtle.
    expect(theme).toContain("bg-ops-booking-subtle text-ops-booking");
    expect(theme).not.toContain("bg-primary-subtle text-ops-booking");
    // Legend booked swatch follows month-grid light-blue bar presentation.
    expect(theme).toContain("calendar-booking-bar-bg");
  });

  it("timeline bar styles use ops-* tokens not Tailwind inventory blues/reds", () => {
    const bars = read("features/availability/lib/bar-styles.ts");
    expect(bars).toContain("BAR_BOOKING_CLASS");
    expect(bars).toContain("BAR_HOLD_CLASS");
    expect(bars).toContain("BAR_OPERATOR_CLASSES");
    expect(bars).not.toContain("bg-blue-");
    expect(bars).not.toContain("bg-red-");
    expect(bars).not.toContain("bg-amber-");
    expect(bars).not.toContain("bg-violet-");
    expect(bars).not.toContain("bg-orange-");
    expect(bars).not.toContain("bg-slate-");

    const legend = read("features/availability/components/CalendarLegend.tsx");
    expect(legend).toContain("LEGEND_SWATCHES");
    expect(legend).not.toContain("bg-blue-");
    expect(legend).not.toContain("bg-emerald-");
  });

  it("calendar booking host still uses shared BookingWorkspaceView", () => {
    const booking = read("features/workspace/workspaces/BookingWorkspace.tsx");
    expect(booking).toContain("BookingWorkspaceView");
  });

  it("Today operations panel keeps arrivals/departures/in-house/holds/blocks", () => {
    const panel = read("features/extranet-calendar/components/ops/TodayOperationsPanel.tsx");
    expect(panel).toContain("Arrivals");
    expect(panel).toContain("Departures");
    expect(panel).toContain("In-house");
    expect(panel).toContain("Holds");
    expect(panel).toContain("Blocks");
    expect(panel).toContain("openWorkspaceForTodayItem");
  });

  it("workspace shell chrome uses Talos surface tokens", () => {
    const shell = read("features/workspace/components/WorkspaceShell.tsx");
    expect(shell).toContain("border-border");
    expect(shell).toContain("bg-surface");
    expect(shell).not.toContain("border-[#d1d5db]");
  });

  it("shiftMonthIso and period label preserve month navigation semantics", () => {
    expect(startOfMonthIso("2026-09-25")).toBe("2026-09-01");
    expect(shiftMonthIso("2026-09-01", -1)).toBe("2026-08-01");
    expect(shiftMonthIso("2026-12-01", 1)).toBe("2027-01-01");
    expect(formatPeriodLabel("2026-09-01")).toMatch(/2026/);
    const model = buildMonthGridModel("2026-09-01", 2);
    expect(model.sections).toHaveLength(2);
    expect(model.sections[0]!.key).toBe("2026-09");
    expect(model.rangeStart).toBe("2026-09-01");
  });

  it("month day card class distinguishes today from selection and focus", () => {
    const base = {
      cellType: "available" as const,
      availability: "available" as const,
      isPast: false,
      isWeekend: false,
      isDragging: false,
    };
    const today = monthGridDayCardClassName({
      ...base,
      isToday: true,
      isSelected: false,
      isFocused: false,
    });
    const selected = monthGridDayCardClassName({
      ...base,
      isToday: false,
      isSelected: true,
      isFocused: false,
    });
    const focused = monthGridDayCardClassName({
      ...base,
      isToday: false,
      isSelected: false,
      isFocused: true,
    });
    expect(today).toContain("ops-today-marker");
    expect(today).not.toContain("ops-selected");
    expect(selected).toContain("ops-selected");
    expect(focused).toContain("outline-dashed");
    expect(focused).not.toContain("ops-selected");
    expect(today).not.toContain("outline-dashed");
    expect(selected).not.toContain("outline-dashed");
    expect(selected).not.toContain("ops-today-marker");
    expect(LEGEND_SWATCHES.map((s) => s.key)).toEqual(
      expect.arrayContaining([
        "available",
        "booked",
        "hold",
        "manual",
        "maintenance",
        "cleaning",
        "owner",
        "closed",
      ]),
    );
  });
});
