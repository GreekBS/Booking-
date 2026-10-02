import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { dateInStayPeriod } from "@/features/availability/lib/calendar-utils";
import type { CalendarRecord } from "@/lib/admin/types";
import {
  MONTH_GRID_COLUMNS,
  buildMonthGridModel,
  buildMonthGridSections,
} from "@/features/extranet-calendar/lib/month-grid-model";
import {
  buildMonthGridVisualSpans,
  monthGridBarPositionStyle,
} from "@/features/extranet-calendar/lib/month-grid-span-layout";

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
  it("keeps checkout exclusive in inventory stay math", () => {
    expect(dateInStayPeriod("2026-10-01", "2026-10-01", "2026-10-05")).toBe(true);
    expect(dateInStayPeriod("2026-10-04", "2026-10-01", "2026-10-05")).toBe(true);
    expect(dateInStayPeriod("2026-10-05", "2026-10-01", "2026-10-05")).toBe(false);
  });

  it("extends visual bar into checkout half-day without marking checkout as a night", () => {
    const dates = ["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04", "2026-10-05"];
    const spans = buildMonthGridVisualSpans(
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
    expect(spans[0]!.endIndex).toBe(4); // visual checkout cell
    expect(spans[0]!.startInset).toBe(0.5);
    expect(spans[0]!.endInset).toBe(0.5);
    expect(spans[0]!.checkInEdge).toBe(true);
    expect(spans[0]!.checkOutEdge).toBe(true);
    // Inventory still excludes checkout day.
    expect(dateInStayPeriod("2026-10-05", spans[0]!.checkIn, spans[0]!.checkOut)).toBe(false);
  });

  it("builds one continuous visual span for a booking entirely inside one row", () => {
    const dates = Array.from({ length: MONTH_GRID_COLUMNS }, (_, i) => {
      const d = i + 1;
      return `2026-10-${String(d).padStart(2, "0")}`;
    });
    const spans = buildMonthGridVisualSpans(
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
    expect(spans[0]!.endIndex).toBe(5); // includes Oct 6 checkout half
    expect(spans[0]!.startInset).toBe(0.5);
    expect(spans[0]!.endInset).toBe(0.5);
    expect(spans[0]!.preview).toContain("Maria");
  });

  it("splits a booking across 9-day row boundaries into separate segments by row", () => {
    const row1 = Array.from({ length: MONTH_GRID_COLUMNS }, (_, i) =>
      `2026-10-${String(i + 1).padStart(2, "0")}`,
    );
    const row2 = Array.from({ length: MONTH_GRID_COLUMNS }, (_, i) =>
      `2026-10-${String(i + 1 + MONTH_GRID_COLUMNS).padStart(2, "0")}`,
    );

    const calendar = bookingCalendar([
      {
        id: "cross",
        checkIn: "2026-10-08",
        checkOut: "2026-10-14",
        status: "confirmed",
        guestName: "Alex Guest",
      },
    ]);

    const spans1 = buildMonthGridVisualSpans(calendar, row1);
    const spans2 = buildMonthGridVisualSpans(calendar, row2);

    // Row1: Oct 8 check-in half → Oct 9 full (flat end at row boundary)
    expect(spans1).toHaveLength(1);
    expect(spans1[0]!.id).toBe("cross");
    expect(spans1[0]!.startIndex).toBe(7);
    expect(spans1[0]!.endIndex).toBe(8);
    expect(spans1[0]!.checkInEdge).toBe(true);
    expect(spans1[0]!.checkOutEdge).toBe(false);
    expect(spans1[0]!.startInset).toBe(0.5);
    expect(spans1[0]!.endInset).toBe(0);

    // Row2: Oct 10 flat start → nights through Oct 13 + checkout Oct 14 half
    expect(spans2).toHaveLength(1);
    expect(spans2[0]!.id).toBe("cross");
    expect(spans2[0]!.startIndex).toBe(0);
    expect(spans2[0]!.endIndex).toBe(4); // nights 10-13 + checkout 14
    expect(spans2[0]!.checkInEdge).toBe(false);
    expect(spans2[0]!.checkOutEdge).toBe(true);
    expect(spans2[0]!.startInset).toBe(0);
    expect(spans2[0]!.endInset).toBe(0.5);
  });

  it("does not merge adjacent bookings with different ids and shares turnover cell halves", () => {
    const dates = ["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04", "2026-10-05"];
    const spans = buildMonthGridVisualSpans(
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
    const a = spans.find((s) => s.id === "a")!;
    const b = spans.find((s) => s.id === "b")!;
    expect(a.endIndex).toBe(2); // Oct 3 checkout half
    expect(a.endInset).toBe(0.5);
    expect(b.startIndex).toBe(2); // Oct 3 check-in half
    expect(b.startInset).toBe(0.5);
    expect(a.endIndex).toBe(b.startIndex);
  });

  it("renders a checkout-only stub when the exclusive checkout day alone appears in a row", () => {
    const row = ["2026-10-11", "2026-10-12", "2026-10-13"];
    const spans = buildMonthGridVisualSpans(
      bookingCalendar([
        {
          id: "edge",
          checkIn: "2026-10-01",
          checkOut: "2026-10-11",
          status: "confirmed",
          guestName: "Edge Guest",
        },
      ]),
      row,
    );

    expect(spans).toHaveLength(1);
    expect(spans[0]!.startIndex).toBe(0);
    expect(spans[0]!.endIndex).toBe(0);
    expect(spans[0]!.startInset).toBe(0);
    expect(spans[0]!.endInset).toBe(0.5);
    expect(spans[0]!.checkOutEdge).toBe(true);
    expect(spans[0]!.checkInEdge).toBe(false);
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

    const sep = buildMonthGridVisualSpans(calendar, septemberTail);
    const oct = buildMonthGridVisualSpans(calendar, octoberHead);

    expect(sep).toHaveLength(1);
    expect(sep[0]!.checkIn).toBe("2026-09-29");
    expect(sep[0]!.checkOut).toBe("2026-10-03");
    expect(sep[0]!.startInset).toBe(0.5);
    expect(sep[0]!.endInset).toBe(0);

    expect(oct).toHaveLength(1);
    expect(oct[0]!.id).toBe("month-cross");
    expect(oct[0]!.endIndex).toBe(2); // includes Oct 3 checkout half
    expect(oct[0]!.endInset).toBe(0.5);
    expect(oct[0]!.checkOutEdge).toBe(true);
  });

  it("keeps hold spans distinct from booking spans", () => {
    const dates = ["2026-10-01", "2026-10-02", "2026-10-03"];
    const spans = buildMonthGridVisualSpans(
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

  it("computes half-day bar geometry that meets at the turnover center", () => {
    const a = {
      id: "a",
      kind: "booking" as const,
      checkIn: "2026-10-01",
      checkOut: "2026-10-03",
      startIndex: 0,
      endIndex: 2,
      checkInEdge: true,
      checkOutEdge: true,
      startInset: 0.5,
      endInset: 0.5,
      label: "A",
      preview: "A",
      zIndex: 30,
    };
    const b = {
      id: "b",
      kind: "booking" as const,
      checkIn: "2026-10-03",
      checkOut: "2026-10-05",
      startIndex: 2,
      endIndex: 4,
      checkInEdge: true,
      checkOutEdge: true,
      startInset: 0.5,
      endInset: 0.5,
      label: "B",
      preview: "B",
      zIndex: 30,
    };

    const posA = monthGridBarPositionStyle(a, MONTH_GRID_COLUMNS, 8);
    const posB = monthGridBarPositionStyle(b, MONTH_GRID_COLUMNS, 8);
    expect(posA.left).toContain("0.5");
    expect(posB.left).toContain("0.5");
    expect(posA.width).toContain("2 *");
    expect(a.endInset).toBe(0.5);
    expect(b.startInset).toBe(0.5);
  });

  it("segments 31/30/28-day months as 9-column rows with non-stretching final rows", () => {
    expect(MONTH_GRID_COLUMNS).toBe(9);

    const oct = buildMonthGridSections("2026-10-01", 1)[0]!; // 31 days
    expect(oct.rows.map((r) => r.dates.length)).toEqual([9, 9, 9, 4]);
    expect(oct.rows[3]!.dates).toEqual([
      "2026-10-28",
      "2026-10-29",
      "2026-10-30",
      "2026-10-31",
    ]);

    const sep = buildMonthGridSections("2026-09-01", 1)[0]!; // 30 days
    expect(sep.rows.map((r) => r.dates.length)).toEqual([9, 9, 9, 3]);
    expect(sep.rows[3]!.dates).toEqual(["2026-09-28", "2026-09-29", "2026-09-30"]);

    const feb = buildMonthGridSections("2026-02-01", 1)[0]!; // 28 days
    expect(feb.rows.map((r) => r.dates.length)).toEqual([9, 9, 9, 1]);
    expect(feb.rows[3]!.dates).toEqual(["2026-02-28"]);

    // Overlay + day grid share MONTH_GRID_COLUMNS; final-row bars use fixed 9 tracks.
    const finalRow = oct.rows[3]!.dates;
    const spans = buildMonthGridVisualSpans(
      bookingCalendar([
        {
          id: "tail",
          checkIn: "2026-10-28",
          checkOut: "2026-11-01",
          status: "confirmed",
          guestName: "Tail Guest",
        },
      ]),
      finalRow,
    );
    expect(spans).toHaveLength(1);
    expect(spans[0]!.startIndex).toBe(0);
    expect(spans[0]!.endIndex).toBe(3);
    const pos = monthGridBarPositionStyle(spans[0]!, MONTH_GRID_COLUMNS, 8);
    expect(pos.left).toContain(`((100% - 64px) / ${MONTH_GRID_COLUMNS})`);
    expect(pos.width).toContain(`((100% - 64px) / ${MONTH_GRID_COLUMNS})`);

    const model = buildMonthGridModel("2026-10-01", 1);
    expect(model.dates).toHaveLength(31);
  });

  it("wires month-grid section to fixed 9-column geometry + visual span overlay", () => {
    const modelSrc = read("features/extranet-calendar/lib/month-grid-model.ts");
    expect(modelSrc).toContain("MONTH_GRID_COLUMNS = 9");

    const section = read("features/extranet-calendar/components/month-grid/MonthGridSection.tsx");
    expect(section).toContain("section.rows.map");
    expect(section).toContain("buildMonthGridVisualSpans");
    expect(section).toContain("MonthGridSpanBar");
    expect(section).toContain("data-month-grid-row");
    expect(section).toContain("MONTH_GRID_COLUMNS");
    expect(section).toContain("minmax(0, 1fr)");
    expect(section).toContain("repeat(${MONTH_GRID_COLUMNS}, minmax(0, 1fr))");
    expect(section).toContain("columnCount={MONTH_GRID_COLUMNS}");
    expect(section).not.toContain("auto-fill");
    expect(section).not.toContain("4.75rem");
    expect(section).not.toContain("repeat(${columnCount}");
    expect(section).not.toContain("repeat(${dates.length}");

    const bar = read("features/extranet-calendar/components/month-grid/MonthGridSpanBar.tsx");
    expect(bar).toContain("MONTH_GRID_BAR_BOOKING_CLASS");
    expect(bar).toContain("pointer-events-none");
    expect(bar).toContain("monthGridBarPositionStyle");
    expect(bar).toContain("min-w-0");

    const viewport = read("features/extranet-calendar/components/month-grid/MonthGridViewport.tsx");
    expect(viewport).toContain("min-w-0");
    expect(viewport).not.toContain("max-w-[1200px]");

    const styles = read("features/extranet-calendar/lib/month-grid-cell-styles.ts");
    expect(styles).toContain("min-w-0");
    expect(styles).toContain("border-border bg-surface text-foreground");

    const css = read("app/globals.css");
    expect(css).toContain("--ops-booking: 153 43% 28%");
    expect(css).toContain("--calendar-booking-bar-bg: 214 95% 93%");

    const keyboard = read("features/extranet-calendar/hooks/useExtranetCalendarKeyboard.ts");
    expect(keyboard).toContain("MONTH_GRID_COLUMNS");
    expect(keyboard).not.toMatch(/dateIndex [+-] 10/);
  });
});
