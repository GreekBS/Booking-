import { describe, it, expect } from "vitest";
import { AvailabilityEvaluator } from "../../src/commerce/availability/AvailabilityEvaluator";
import { StayPeriod } from "../../src/commerce/shared/value-objects/StayPeriod";
import { LocalDate } from "../../src/commerce/shared/value-objects/LocalDate";
import { GuestCount } from "../../src/commerce/shared/value-objects/GuestCount";
import type { UnitAvailabilityRulesProps } from "../../src/commerce/shared/types/CommerceTypes";
import {
  blockedDates,
  defaultAvailabilityRules,
  hotelProperty,
  villaProperty,
  evaluateAvailability,
} from "./fixtures/commerceFixtures";

const evaluator = new AvailabilityEvaluator();

const defaultRules: UnitAvailabilityRulesProps = {
  ...defaultAvailabilityRules,
  advanceMinDays: 0,
};

function evaluate(
  checkIn: string,
  checkOut: string,
  overrides: Partial<{
    guestCount: number;
    unitMaxGuests: number;
    rules: UnitAvailabilityRulesProps;
    blocks: typeof blockedDates;
    today: string;
    excludeSourceIds?: string[];
  }> = {},
) {
  return evaluator.evaluate({
    stayPeriod: StayPeriod.create(checkIn, checkOut),
    guestCount: GuestCount.create(overrides.guestCount ?? 2),
    unitMaxGuests: overrides.unitMaxGuests ?? 4,
    rules: overrides.rules ?? defaultRules,
    activeBlocks: overrides.blocks ?? [],
    propertyLocalToday: LocalDate.create(overrides.today ?? "2025-06-01"),
    excludeSourceIds: overrides.excludeSourceIds,
  });
}

describe("AvailabilityEvaluator", () => {
  it("returns available when all rules pass", () => {
    const result = evaluate("2025-08-01", "2025-08-04");
    expect(result.available).toBe(true);
    expect(result.reasons).toHaveLength(0);
  });

  it("rejects when guest count exceeds maxGuests", () => {
    const result = evaluate("2025-08-01", "2025-08-04", {
      guestCount: 7,
      unitMaxGuests: villaProperty.units[0].maxGuests,
    });
    expect(result.available).toBe(false);
    expect(result.reasons.some((r) => r.code === "GUEST_COUNT_EXCEEDED")).toBe(true);
  });

  it("enforces min nights", () => {
    const result = evaluate("2025-08-01", "2025-08-02");
    expect(result.reasons.some((r) => r.code === "MIN_NIGHTS")).toBe(true);
  });

  it("enforces max nights", () => {
    const result = evaluate("2025-08-01", "2025-08-20", {
      rules: { ...defaultRules, maxNights: 7 },
    });
    expect(result.reasons.some((r) => r.code === "MAX_NIGHTS")).toBe(true);
  });

  it("enforces check-in weekday restrictions", () => {
    const result = evaluate("2025-08-04", "2025-08-07", {
      rules: { ...defaultRules, checkInDays: [6] },
    });
    expect(result.reasons.some((r) => r.code === "CHECK_IN_DAY")).toBe(true);
  });

  it("enforces check-out weekday restrictions", () => {
    const result = evaluate("2025-08-01", "2025-08-05", {
      rules: { ...defaultRules, checkOutDays: [1] },
    });
    expect(result.reasons.some((r) => r.code === "CHECK_OUT_DAY")).toBe(true);
  });

  it("enforces advance booking minimum", () => {
    const result = evaluate("2025-06-02", "2025-06-05", {
      rules: { ...defaultRules, advanceMinDays: 7 },
      today: "2025-06-01",
    });
    expect(result.reasons.some((r) => r.code === "ADVANCE_MIN")).toBe(true);
  });

  it("enforces advance booking maximum", () => {
    const result = evaluate("2026-08-01", "2026-08-04", {
      rules: { ...defaultRules, advanceMaxDays: 30 },
      today: "2025-06-01",
    });
    expect(result.reasons.some((r) => r.code === "ADVANCE_MAX")).toBe(true);
  });

  it("rejects overlapping active blocks", () => {
    const result = evaluate("2025-08-12", "2025-08-14", { blocks: blockedDates });
    expect(result.reasons.some((r) => r.code === "BLOCKED")).toBe(true);
  });

  it("ignores released blocks", () => {
    const result = evaluate("2025-08-12", "2025-08-14", {
      blocks: [{ ...blockedDates[0], status: "released" }],
    });
    expect(result.available).toBe(true);
  });

  it("enforces turnover buffer after booking checkout", () => {
    const result = evaluate("2025-08-05", "2025-08-07", {
      rules: { ...defaultRules, turnoverNights: 2 },
      blocks: [
        {
          blockType: "booking",
          status: "active",
          checkIn: "2025-08-01",
          checkOut: "2025-08-05",
          sourceId: "booking-other",
        },
      ],
    });
    expect(result.reasons.some((r) => r.code === "TURNOVER_BUFFER")).toBe(true);
  });

  it("excludes blocks by sourceId when excludeSourceIds is set", () => {
    const result = evaluate("2025-08-01", "2025-08-04", {
      blocks: [
        {
          blockType: "booking",
          status: "active",
          checkIn: "2025-08-01",
          checkOut: "2025-08-04",
          sourceId: "booking-self",
        },
      ],
      excludeSourceIds: ["booking-self"],
    });
    expect(result.available).toBe(true);
  });

  it("evaluates hotel units independently via fixtures", () => {
    const unit = hotelProperty.units[1];
    const result = evaluateAvailability(
      unit.maxGuests,
      "2025-08-01",
      "2025-08-04",
      defaultRules,
      blockedDates,
    );
    expect(result.available).toBe(true);
  });
});
