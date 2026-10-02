import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { dateInStayPeriod } from "@/features/availability/lib/calendar-utils";
import type { CalendarRecord } from "@/lib/admin/types";
import {
  MONTH_GRID_COLUMNS_DEFAULT,
  buildMonthGridModel,
  buildMonthGridSections,
  chunkDates,
  monthGridRowLengths,
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
    expect(spans[0]!.endIndex).toBe(4);
    expect(spans[0]!.startInset).toBe(0.5);
    expect(spans[0]!.endInset).toBe(0.5);
    expect(dateInStayPeriod("2026-10-05", spans[0]!.checkIn, spans[0]!.checkOut)).toBe(false);
  });

  it("builds one continuous visual span for a booking entirely inside one row", () => {
    const dates = Array.from({ length: MONTH_GRID_COLUMNS_DEFAULT }, (_, i) => {
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
    expect(spans[0]!.startIndex).toBe(1);
    expect(spans[0]!.endIndex).toBe(5);
    expect(spans[0]!.startInset).toBe(0.5);
    expect(spans[0]!.endInset).toBe(0.5);
  });

  it.each([
    { columns: 4, lengths: [4, 4, 4, 4, 4, 4, 4, 3] },
    { columns: 7, lengths: [7, 7, 7, 7, 3] },
    { columns: 8, lengths: [8, 8, 8, 7] },
    { columns: 9, lengths: [9, 9, 9, 4] },
    { columns: 10, lengths: [10, 10, 10, 1] },
    { columns: 12, lengths: [12, 12, 7] },
  ] as const)(
    "segments a 31-day month into $columns-column rows without stretching",
    ({ columns, lengths }) => {
      expect(monthGridRowLengths(31, columns)).toEqual([...lengths]);
      const oct = buildMonthGridSections("2026-10-01", 1)[0]!;
      const rows = chunkDates(oct.dates, columns);
      expect(rows.map((r) => r.dates.length)).toEqual([...lengths]);
      expect(rows[rows.length - 1]!.dates.length).toBeLessThanOrEqual(columns);
    },
  );

  it("splits a booking across dynamic row boundaries with flat continuation edges", () => {
    const columns = 8;
    const month = buildMonthGridSections("2026-10-01", 1)[0]!;
    const rows = chunkDates(month.dates, columns);
    const calendar = bookingCalendar([
      {
        id: "cross",
        checkIn: "2026-10-07",
        checkOut: "2026-10-12",
        status: "confirmed",
        guestName: "Alex Guest",
      },
    ]);

    // Row0 ends at Oct 8; booking spans Oct 7–8 into row1 Oct 9–11 + checkout 12.
    const spans0 = buildMonthGridVisualSpans(calendar, rows[0]!.dates);
    const spans1 = buildMonthGridVisualSpans(calendar, rows[1]!.dates);

    expect(spans0).toHaveLength(1);
    expect(spans0[0]!.startIndex).toBe(6); // Oct 7
    expect(spans0[0]!.endIndex).toBe(7); // Oct 8
    expect(spans0[0]!.checkInEdge).toBe(true);
    expect(spans0[0]!.checkOutEdge).toBe(false);
    expect(spans0[0]!.startInset).toBe(0.5);
    expect(spans0[0]!.endInset).toBe(0); // flat row-end continuation

    expect(spans1).toHaveLength(1);
    expect(spans1[0]!.startIndex).toBe(0); // Oct 9
    expect(spans1[0]!.checkInEdge).toBe(false);
    expect(spans1[0]!.startInset).toBe(0); // flat row-start continuation
    expect(spans1[0]!.checkOutEdge).toBe(true);
    expect(spans1[0]!.endInset).toBe(0.5);
  });

  it("does not merge adjacent bookings and shares turnover cell halves for any column count", () => {
    for (const columns of [4, 8, 9, 12]) {
      const dates = Array.from({ length: columns }, (_, i) => `2026-10-${String(i + 1).padStart(2, "0")}`);
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

      const a = spans.find((s) => s.id === "a")!;
      const b = spans.find((s) => s.id === "b")!;
      expect(a.endInset).toBe(0.5);
      expect(b.startInset).toBe(0.5);
      expect(a.endIndex).toBe(b.startIndex);

      const posA = monthGridBarPositionStyle(a, columns, 8);
      const posB = monthGridBarPositionStyle(b, columns, 8);
      expect(posA.width).toBeTruthy();
      expect(posB.left).toContain("0.5");
    }
  });

  it("rechunks rows when resolved columns change (9→8 and 8→10)", () => {
    const month = buildMonthGridSections("2026-10-01", 1)[0]!;
    expect(chunkDates(month.dates, 9).map((r) => r.dates.length)).toEqual([9, 9, 9, 4]);
    expect(chunkDates(month.dates, 8).map((r) => r.dates.length)).toEqual([8, 8, 8, 7]);
    expect(chunkDates(month.dates, 10).map((r) => r.dates.length)).toEqual([10, 10, 10, 1]);
  });

  it("uses identical column geometry for overlay positioning at each resolved count", () => {
    for (const columns of [4, 7, 8, 9, 10, 12]) {
      const span = {
        id: "x",
        kind: "booking" as const,
        checkIn: "2026-10-01",
        checkOut: "2026-10-03",
        startIndex: 0,
        endIndex: 2,
        checkInEdge: true,
        checkOutEdge: true,
        startInset: 0.5,
        endInset: 0.5,
        label: "X",
        preview: "X",
        zIndex: 30,
      };
      const pos = monthGridBarPositionStyle(span, columns, 8);
      expect(pos.left).toContain(`/ ${columns})`);
      expect(pos.width).toContain(`/ ${columns})`);
    }
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
    expect(spans[0]!.endInset).toBe(0.5);
    expect(spans[0]!.checkOutEdge).toBe(true);
    expect(spans[0]!.checkInEdge).toBe(false);
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

  it("wires adaptive month-grid section to shared columns + visual span overlay", () => {
    const modelSrc = read("features/extranet-calendar/lib/month-grid-model.ts");
    expect(modelSrc).toContain("MONTH_GRID_COLUMNS_DEFAULT = 9");
    expect(modelSrc).toContain("export function chunkDates");

    const section = read("features/extranet-calendar/components/month-grid/MonthGridSection.tsx");
    expect(section).toContain("chunkDates(section.dates, columns)");
    expect(section).toContain("buildMonthGridVisualSpans");
    expect(section).toContain("columnCount={columns}");
    expect(section).toContain("repeat(${columns}, minmax(0, 1fr))");
    expect(section).not.toContain("4.75rem");
    expect(section).not.toContain("repeat(${columnCount}");

    const viewport = read("features/extranet-calendar/components/month-grid/MonthGridViewport.tsx");
    expect(viewport).toContain("data-month-grid-measure");
    expect(viewport).toContain("measureRef");
    expect(viewport).toContain("columns={columns}");

    const shell = read("features/extranet-calendar/components/shell/ExtranetCalendarShell.tsx");
    expect(shell).toContain("useMonthGridColumnCount");
    expect(shell).toContain("columnsPerRow={columns}");

    const keyboard = read("features/extranet-calendar/hooks/useExtranetCalendarKeyboard.ts");
    expect(keyboard).toContain("columnsPerRow");
    expect(keyboard).not.toMatch(/MONTH_GRID_COLUMNS(?!_DEFAULT)/);

    const bar = read("features/extranet-calendar/components/month-grid/MonthGridSpanBar.tsx");
    expect(bar).toContain("min-w-0 truncate");

    const css = read("app/globals.css");
    expect(css).toContain("--ops-booking: 153 43% 28%");
    expect(css).toContain("--calendar-booking-bar-bg: 214 95% 93%");

    const model = buildMonthGridModel("2026-10-01", 1);
    expect(model.dates).toHaveLength(31);
    expect(model.sections[0]!.dates).toHaveLength(31);
  });
});
