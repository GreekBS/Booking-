import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildCalendarSpans } from "@/features/availability/lib/span-layout";
import { dateInStayPeriod } from "@/features/availability/lib/calendar-utils";
import type { CalendarRecord } from "@/lib/admin/types";
import { DAYS_PER_ROW } from "@/features/extranet-calendar/lib/month-grid-model";

const root = join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function bookingCalendar(
  bookings: CalendarRecord["bookings"],
  extras: Partial<CalendarRecord> = {},
): CalendarRecord {
  return {
    blocks: extras.blocks ?? [],
    holds: extras.holds ?? [],
    bookings,
  };
}

describe("Month-grid continuous reservation bars", () => {
  it("keeps checkout exclusive in stay math and span edges", () => {
    expect(dateInStayPeriod("2026-10-01", "2026-10-01", "2026-10-05")).toBe(true);
    expect(dateInStayPeriod("2026-10-04", "2026-10-01", "2026-10-05")).toBe(true);
    expect(dateInStayPeriod("2026-10-05", "2026-10-01", "2026-10-05")).toBe(false);

    const dates = ["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04", "2026-10-05"];
    const spans = buildCalendarSpans(
      bookingCalendar([
        {
          id: "b1",
          checkIn: "2026-10-01",
          checkOut: "2026-10-05",
          status: "confirmed",
          guestName: "Ευάγγελος Στεφανάκης",
        },
      ]),
      dates,
    );

    expect(spans).toHaveLength(1);
    expect(spans[0]!.startIndex).toBe(0);
    expect(spans[0]!.endIndex).toBe(3);
    expect(spans[0]!.checkInEdge).toBe(true);
    expect(spans[0]!.checkOutEdge).toBe(true);
  });

  it("builds one continuous span for a booking entirely inside one row", () => {
    const dates = Array.from({ length: DAYS_PER_ROW }, (_, i) => {
      const d = i + 1;
      return `2026-10-${String(d).padStart(2, "0")}`;
    });
    const spans = buildCalendarSpans(
      bookingCalendar([
        {
          id: "b1",
          checkIn: "2026-10-02",
          checkOut: "2026-10-06",
          status: "confirmed",
          guestName: "Maria Papadaki",
        },
      ]),
      dates,
    );

    expect(spans).toHaveLength(1);
    expect(spans[0]!.id).toBe("b1");
    expect(spans[0]!.startIndex).toBe(1);
    expect(spans[0]!.endIndex).toBe(4);
    expect(spans[0]!.preview).toContain("Maria");
  });

  it("splits a booking across 10-day row boundaries into separate segments by row", () => {
    const row1 = Array.from({ length: 10 }, (_, i) => `2026-10-${String(i + 1).padStart(2, "0")}`);
    const row2 = Array.from({ length: 10 }, (_, i) => `2026-10-${String(i + 11).padStart(2, "0")}`);

    const calendar = bookingCalendar([
      {
        id: "cross",
        checkIn: "2026-10-08",
        checkOut: "2026-10-14",
        status: "confirmed",
        guestName: "Alex Guest",
      },
    ]);

    const spans1 = buildCalendarSpans(calendar, row1);
    const spans2 = buildCalendarSpans(calendar, row2);

    expect(spans1).toHaveLength(1);
    expect(spans1[0]!.id).toBe("cross");
    expect(spans1[0]!.startIndex).toBe(7);
    expect(spans1[0]!.endIndex).toBe(9);
    expect(spans1[0]!.checkInEdge).toBe(true);
    expect(spans1[0]!.checkOutEdge).toBe(false);

    expect(spans2).toHaveLength(1);
    expect(spans2[0]!.id).toBe("cross");
    expect(spans2[0]!.startIndex).toBe(0);
    expect(spans2[0]!.endIndex).toBe(2);
    expect(spans2[0]!.checkInEdge).toBe(false);
    expect(spans2[0]!.checkOutEdge).toBe(true);
  });

  it("does not merge adjacent bookings with different ids", () => {
    const dates = ["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"];
    const spans = buildCalendarSpans(
      bookingCalendar([
        {
          id: "a",
          checkIn: "2026-10-01",
          checkOut: "2026-10-03",
          status: "confirmed",
          guestName: "Guest A",
        },
        {
          id: "b",
          checkIn: "2026-10-03",
          checkOut: "2026-10-05",
          status: "confirmed",
          guestName: "Guest B",
        },
      ]),
      dates,
    );

    expect(spans).toHaveLength(2);
    expect(spans.map((s) => s.id).sort()).toEqual(["a", "b"]);
    expect(spans.find((s) => s.id === "a")!.endIndex).toBe(1);
    expect(spans.find((s) => s.id === "b")!.startIndex).toBe(2);
  });

  it("clips month-boundary segments without mutating stay dates", () => {
    const septemberTail = ["2026-09-28", "2026-09-29", "2026-09-30"];
    const octoberHead = ["2026-10-01", "2026-10-02", "2026-10-03"];
    const calendar = bookingCalendar([
      {
        id: "month-cross",
        checkIn: "2026-09-29",
        checkOut: "2026-10-03",
        status: "confirmed",
        guestName: "Cross Month",
      },
    ]);

    const sep = buildCalendarSpans(calendar, septemberTail);
    const oct = buildCalendarSpans(calendar, octoberHead);

    expect(sep).toHaveLength(1);
    expect(sep[0]!.checkIn).toBe("2026-09-29");
    expect(sep[0]!.checkOut).toBe("2026-10-03");
    expect(sep[0]!.startIndex).toBe(1);
    expect(sep[0]!.endIndex).toBe(2);
    expect(sep[0]!.checkInEdge).toBe(true);
    expect(sep[0]!.checkOutEdge).toBe(false);

    expect(oct).toHaveLength(1);
    expect(oct[0]!.id).toBe("month-cross");
    expect(oct[0]!.startIndex).toBe(0);
    expect(oct[0]!.endIndex).toBe(1);
    expect(oct[0]!.checkInEdge).toBe(false);
    expect(oct[0]!.checkOutEdge).toBe(true);
  });

  it("keeps hold spans distinct from booking spans", () => {
    const dates = ["2026-10-01", "2026-10-02", "2026-10-03"];
    const spans = buildCalendarSpans(
      bookingCalendar(
        [
          {
            id: "b1",
            checkIn: "2026-10-01",
            checkOut: "2026-10-02",
            status: "confirmed",
            guestName: "Booked Guest",
          },
        ],
        {
          holds: [
            {
              id: "h1",
              checkIn: "2026-10-02",
              checkOut: "2026-10-04",
              status: "active",
              expiresAt: new Date(Date.now() + 60_000).toISOString(),
            },
          ],
        },
      ),
      dates,
    );

    expect(spans.some((s) => s.kind === "booking" && s.id === "b1")).toBe(true);
    expect(spans.some((s) => s.kind === "hold" && s.id === "h1")).toBe(true);
  });

  it("wires month-grid section to row grids + span overlay and light-blue booking bars", () => {
    const section = read("features/extranet-calendar/components/month-grid/MonthGridSection.tsx");
    expect(section).toContain("section.rows.map");
    expect(section).toContain("buildCalendarSpans");
    expect(section).toContain("MonthGridSpanBar");
    expect(section).toContain("data-month-grid-row");
    expect(section).not.toContain("auto-fill");

    const bar = read("features/extranet-calendar/components/month-grid/MonthGridSpanBar.tsx");
    expect(bar).toContain("MONTH_GRID_BAR_BOOKING_CLASS");
    expect(bar).toContain("pointer-events-none");
    expect(bar).toContain('aria-hidden');
    expect(bar).toContain("checkInEdge");
    expect(bar).toContain("checkOutEdge");

    const card = read("features/extranet-calendar/components/month-grid/MonthGridDayCard.tsx");
    expect(card).toContain("monthGridOccupancyUsesSpanBar");
    expect(card).toContain("aria-label");
    expect(card).toContain("resolveMonthGridDayPrice");

    const styles = read("features/extranet-calendar/lib/month-grid-cell-styles.ts");
    expect(styles).toContain('case "booked":');
    expect(styles).toContain("border-border bg-surface text-foreground");
    expect(styles).not.toMatch(/case "booked":\s*return "border-ops-booking bg-ops-booking/);
    expect(styles).toContain("ops-selected");
    expect(styles).toContain("ops-today-marker");

    const theme = read("features/extranet-calendar/lib/visual-theme.ts");
    expect(theme).toContain("MONTH_GRID_BAR_BOOKING_CLASS");
    expect(theme).toContain("calendar-booking-bar-bg");
    expect(theme).toContain("calendar-booking-bar-fg");

    const css = read("app/globals.css");
    expect(css).toContain("--calendar-booking-bar-bg: 214 95% 93%");
    expect(css).toContain("--calendar-booking-bar-fg: 224 76% 48%");
    expect(css).toContain("--ops-booking: 153 43% 28%");
    expect(css).not.toMatch(/--ops-booking:\s*214 95% 93%/);
    expect(css).not.toMatch(/--ops-booking:\s*217 91% 53%/);

    const density = read("features/extranet-calendar/lib/density.ts");
    expect(density).toContain("barHeightPx: 20");
    expect(density).toContain("barHeightPx: 24");
  });
});
