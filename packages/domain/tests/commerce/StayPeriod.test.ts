import { describe, it, expect } from "vitest";
import { LocalDate } from "../../src/commerce/shared/value-objects/LocalDate";
import { StayPeriod } from "../../src/commerce/shared/value-objects/StayPeriod";
import { ValidationError } from "../../src/shared/errors/DomainError";

describe("LocalDate", () => {
  it("creates valid dates", () => {
    expect(LocalDate.create("2025-07-01").value).toBe("2025-07-01");
    expect(LocalDate.create("2025-07-01").dayOfWeek()).toBe(2);
  });

  it("adds days across month boundary", () => {
    expect(LocalDate.create("2025-01-31").addDays(1).value).toBe("2025-02-01");
  });

  it("rejects invalid calendar dates", () => {
    expect(() => LocalDate.create("2025-02-30")).toThrow(ValidationError);
    expect(() => LocalDate.create("2025-13-01")).toThrow(ValidationError);
  });
});

describe("StayPeriod checkout-exclusive behavior", () => {
  it("counts nights with checkout exclusive", () => {
    const period = StayPeriod.create("2025-07-01", "2025-07-04");
    expect(period.nightCount()).toBe(3);
    expect(period.nights().map((n) => n.value)).toEqual([
      "2025-07-01",
      "2025-07-02",
      "2025-07-03",
    ]);
  });

  it("does not include checkout date as a night", () => {
    const period = StayPeriod.create("2025-07-01", "2025-07-02");
    expect(period.nightCount()).toBe(1);
    expect(period.containsNight(LocalDate.create("2025-07-01"))).toBe(true);
    expect(period.containsNight(LocalDate.create("2025-07-02"))).toBe(false);
  });

  it("requires checkOut after checkIn", () => {
    expect(() => StayPeriod.create("2025-07-05", "2025-07-01")).toThrow(ValidationError);
    expect(() => StayPeriod.create("2025-07-01", "2025-07-01")).toThrow(ValidationError);
  });
});

describe("StayPeriod overlap edge cases", () => {
  const a = StayPeriod.create("2025-07-01", "2025-07-05");

  it("detects partial overlap", () => {
    expect(a.overlaps(StayPeriod.create("2025-07-03", "2025-07-07"))).toBe(true);
  });

  it("does not overlap adjacent checkout/checkin", () => {
    expect(a.overlaps(StayPeriod.create("2025-07-05", "2025-07-08"))).toBe(false);
  });

  it("detects contained period", () => {
    expect(a.overlaps(StayPeriod.create("2025-07-02", "2025-07-04"))).toBe(true);
  });

  it("detects enclosing period", () => {
    expect(a.overlaps(StayPeriod.create("2025-06-28", "2025-07-10"))).toBe(true);
  });

  it("does not overlap disjoint periods", () => {
    expect(a.overlaps(StayPeriod.create("2025-07-10", "2025-07-12"))).toBe(false);
  });
});
