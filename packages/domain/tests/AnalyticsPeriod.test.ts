import { describe, expect, it } from "vitest";
import {
  buildHalfYear,
  buildMonth,
  buildQuarter,
  buildWeek,
  buildYear,
  occupiedNightsInPeriod,
  periodDayCount,
  prorateStayRevenue,
  resolveAnalyticsPeriod,
  shiftAnalyticsPeriod,
  LocalDate,
} from "../src/index";

describe("AnalyticsPeriod", () => {
  it("defaults missing/invalid params to Year of property-local today", () => {
    const w = resolveAnalyticsPeriod({}, "2026-10-01");
    expect(w.periodType).toBe("year");
    expect(w.year).toBe(2026);
    expect(w.startDate).toBe("2026-01-01");
    expect(w.endDateExclusive).toBe("2027-01-01");
  });

  it("resolves Year 2026 boundaries", () => {
    const w = resolveAnalyticsPeriod({ period: "year", year: "2026" }, "2026-10-01");
    expect(w).toMatchObject({
      periodType: "year",
      startDate: "2026-01-01",
      endDateExclusive: "2027-01-01",
    });
  });

  it("handles leap year 2028 day count", () => {
    const w = buildYear(2028);
    expect(periodDayCount(w.startDate, w.endDateExclusive)).toBe(366);
  });

  it("Week is Monday–Sunday", () => {
    // 2026-10-01 is Thursday → week Mon 2026-09-28 → Sun 2026-10-04
    const w = resolveAnalyticsPeriod({ period: "week" }, "2026-10-01");
    expect(w.startDate).toBe("2026-09-28");
    expect(w.endDateExclusive).toBe("2026-10-05");
    expect(LocalDate.create(w.startDate).dayOfWeek()).toBe(1); // Monday
  });

  it("month boundaries", () => {
    const w = buildMonth(2026, 10);
    expect(w.startDate).toBe("2026-10-01");
    expect(w.endDateExclusive).toBe("2026-11-01");
  });

  it("quarters Q1–Q4", () => {
    expect(buildQuarter(2026, 1).endDateExclusive).toBe("2026-04-01");
    expect(buildQuarter(2026, 2).endDateExclusive).toBe("2026-07-01");
    expect(buildQuarter(2026, 3).endDateExclusive).toBe("2026-10-01");
    expect(buildQuarter(2026, 4).endDateExclusive).toBe("2027-01-01");
  });

  it("half-year H1/H2", () => {
    expect(buildHalfYear(2026, 1)).toMatchObject({
      startDate: "2026-01-01",
      endDateExclusive: "2026-07-01",
    });
    expect(buildHalfYear(2026, 2)).toMatchObject({
      startDate: "2026-07-01",
      endDateExclusive: "2027-01-01",
    });
  });

  it("accepts period=half alias", () => {
    const w = resolveAnalyticsPeriod(
      { period: "half", year: "2026", half: "2" },
      "2026-10-01",
    );
    expect(w.periodType).toBe("half_year");
    expect(w.half).toBe(2);
  });

  it("shifts previous/next periods", () => {
    expect(shiftAnalyticsPeriod(buildYear(2026), 1).year).toBe(2027);
    expect(shiftAnalyticsPeriod(buildMonth(2026, 12), 1).startDate).toBe(
      "2027-01-01",
    );
    expect(shiftAnalyticsPeriod(buildQuarter(2026, 4), 1).displayLabel).toBe(
      "Q1 2027",
    );
    expect(shiftAnalyticsPeriod(buildHalfYear(2026, 2), 1).displayLabel).toBe(
      "H1 2027",
    );
    const week = buildWeek(LocalDate.create("2026-09-28"));
    expect(shiftAnalyticsPeriod(week, 1).startDate).toBe("2026-10-05");
  });

  it("falls back invalid URL values to Year", () => {
    const w = resolveAnalyticsPeriod(
      { period: "nope", year: "not-a-year" },
      "2027-03-15",
    );
    expect(w.periodType).toBe("year");
    expect(w.year).toBe(2027);
  });
});

describe("stay attribution", () => {
  const stayIn = "2026-12-29";
  const stayOut = "2027-01-03";

  it("splits occupied nights across years", () => {
    expect(
      occupiedNightsInPeriod(stayIn, stayOut, "2026-01-01", "2027-01-01"),
    ).toBe(3);
    expect(
      occupiedNightsInPeriod(stayIn, stayOut, "2027-01-01", "2028-01-01"),
    ).toBe(2);
  });

  it("prorates revenue across years without duplication", () => {
    // 5 nights, €500 → €100/night
    const y2026 = prorateStayRevenue(
      "500.0000",
      stayIn,
      stayOut,
      "2026-01-01",
      "2027-01-01",
    );
    const y2027 = prorateStayRevenue(
      "500.0000",
      stayIn,
      stayOut,
      "2027-01-01",
      "2028-01-01",
    );
    expect(y2026).toBeCloseTo(300, 5);
    expect(y2027).toBeCloseTo(200, 5);
    expect(y2026 + y2027).toBeCloseTo(500, 5);
  });

  it("handles cross-month stay", () => {
    expect(
      occupiedNightsInPeriod(
        "2026-09-28",
        "2026-10-03",
        "2026-10-01",
        "2026-11-01",
      ),
    ).toBe(2);
  });
});
