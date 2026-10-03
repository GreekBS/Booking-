import { describe, expect, it } from "vitest";
import {
  AvailabilityEvaluator,
  HISTORICAL_GUEST_CAPACITY_WARNING_CODE,
} from "../../src/commerce/availability/AvailabilityEvaluator";
import { StayPeriod } from "../../src/commerce/shared/value-objects/StayPeriod";
import { LocalDate } from "../../src/commerce/shared/value-objects/LocalDate";
import { GuestCount } from "../../src/commerce/shared/value-objects/GuestCount";
import type { UnitAvailabilityRulesProps } from "../../src/commerce/shared/types/CommerceTypes";
import type { AvailabilityEvaluationPolicy } from "../../src/commerce/import/ImportAvailabilityPolicy";
import { defaultAvailabilityRules } from "./fixtures/commerceFixtures";

const evaluator = new AvailabilityEvaluator();

const strictRules: UnitAvailabilityRulesProps = {
  ...defaultAvailabilityRules,
  minNights: 3,
  maxNights: 7,
  checkInDays: [1], // Monday only
  checkOutDays: [5], // Friday only
  advanceMinDays: 2,
  advanceMaxDays: 30,
  turnoverNights: 1,
};

function evaluate(
  checkIn: string,
  checkOut: string,
  overrides: {
    guestCount?: number;
    unitMaxGuests?: number;
    rules?: UnitAvailabilityRulesProps;
    today?: string;
    policy?: AvailabilityEvaluationPolicy;
    blocks?: Array<{
      blockType: "booking" | "maintenance" | "hold" | "manual" | "owner" | "cleaning" | "turnover" | "channel_import";
      status: "active" | "released" | "expired" | "cancelled";
      checkIn: string;
      checkOut: string;
      sourceId: string | null;
    }>;
  } = {},
) {
  return evaluator.evaluate({
    stayPeriod: StayPeriod.create(checkIn, checkOut),
    guestCount: GuestCount.create(overrides.guestCount ?? 2),
    unitMaxGuests: overrides.unitMaxGuests ?? 4,
    rules: overrides.rules ?? strictRules,
    activeBlocks: overrides.blocks ?? [],
    propertyLocalToday: LocalDate.create(overrides.today ?? "2026-10-03"),
    policy: overrides.policy,
  });
}

describe("AvailabilityEvaluator import policies", () => {
  describe("live_sell / default (unchanged)", () => {
    it("still rejects over-capacity", () => {
      const result = evaluate("2026-11-10", "2026-11-15", {
        guestCount: 6,
        unitMaxGuests: 4,
      });
      expect(result.available).toBe(false);
      expect(result.reasons.some((r) => r.code === "GUEST_COUNT_EXCEEDED")).toBe(true);
      expect(result.warnings).toHaveLength(0);
    });

    it("still rejects advance / min nights / CTA", () => {
      // check-in tomorrow with advanceMin 2; also 2 nights vs min 3; not Monday
      const result = evaluate("2026-10-04", "2026-10-06", { today: "2026-10-03" });
      expect(result.available).toBe(false);
      expect(result.reasons.some((r) => r.code === "ADVANCE_MIN")).toBe(true);
      expect(result.reasons.some((r) => r.code === "MIN_NIGHTS")).toBe(true);
    });
  });

  describe("csv_import_historical", () => {
    it("bypasses advance, min/max nights, CTA/CTD", () => {
      // Historical Jul 2024: 2 nights, not Mon/Fri, long ago
      const result = evaluate("2024-07-10", "2024-07-12", {
        policy: "csv_import_historical",
        today: "2026-10-03",
        rules: strictRules,
      });
      expect(result.available).toBe(true);
      expect(result.reasons).toHaveLength(0);
    });

    it("bypasses turnover buffer", () => {
      const result = evaluate("2024-07-15", "2024-07-18", {
        policy: "csv_import_historical",
        today: "2026-10-03",
        blocks: [
          {
            blockType: "booking",
            status: "active",
            checkIn: "2024-07-10",
            checkOut: "2024-07-15",
            sourceId: "old-booking",
          },
        ],
      });
      // Adjacent half-open: no stay overlap; turnover would block live_sell
      expect(result.available).toBe(true);
      expect(result.reasons.some((r) => r.code === "TURNOVER_BUFFER")).toBe(false);
    });

    it("still blocks overlapping booking occupancy", () => {
      const result = evaluate("2024-07-12", "2024-07-17", {
        policy: "csv_import_historical",
        today: "2026-10-03",
        blocks: [
          {
            blockType: "booking",
            status: "active",
            checkIn: "2024-07-10",
            checkOut: "2024-07-15",
            sourceId: "existing",
          },
        ],
      });
      expect(result.available).toBe(false);
      expect(result.reasons.some((r) => r.code === "BLOCKED")).toBe(true);
    });

    it("treats guest over-capacity as non-blocking warning", () => {
      const result = evaluate("2024-07-10", "2024-07-12", {
        policy: "csv_import_historical",
        guestCount: 6,
        unitMaxGuests: 4,
        today: "2026-10-03",
      });
      expect(result.available).toBe(true);
      expect(result.reasons.some((r) => r.code === "GUEST_COUNT_EXCEEDED")).toBe(false);
      expect(
        result.warnings.some((w) => w.code === HISTORICAL_GUEST_CAPACITY_WARNING_CODE),
      ).toBe(true);
    });
  });

  describe("csv_import_in_progress", () => {
    it("bypasses advance and min-stay but enforces capacity", () => {
      const result = evaluate("2026-10-01", "2026-10-07", {
        policy: "csv_import_in_progress",
        today: "2026-10-03",
        guestCount: 6,
        unitMaxGuests: 4,
      });
      expect(result.available).toBe(false);
      expect(result.reasons.some((r) => r.code === "GUEST_COUNT_EXCEEDED")).toBe(true);
    });

    it("enforces booking overlap on remaining nights", () => {
      const result = evaluate("2026-10-01", "2026-10-07", {
        policy: "csv_import_in_progress",
        today: "2026-10-03",
        blocks: [
          {
            blockType: "booking",
            status: "active",
            checkIn: "2026-10-05",
            checkOut: "2026-10-10",
            sourceId: "other",
          },
        ],
      });
      expect(result.available).toBe(false);
      expect(result.reasons.some((r) => r.code === "BLOCKED")).toBe(true);
    });

    it("enforces turnover for in-progress", () => {
      const result = evaluate("2026-10-01", "2026-10-07", {
        policy: "csv_import_in_progress",
        today: "2026-10-03",
        blocks: [
          {
            blockType: "booking",
            status: "active",
            checkIn: "2026-09-25",
            checkOut: "2026-10-01",
            sourceId: "prior",
          },
        ],
      });
      expect(result.available).toBe(false);
      expect(result.reasons.some((r) => r.code === "TURNOVER_BUFFER")).toBe(true);
    });
  });

  describe("csv_import_future", () => {
    it("enforces live sellability including capacity", () => {
      const result = evaluate("2026-11-10", "2026-11-15", {
        policy: "csv_import_future",
        guestCount: 6,
        unitMaxGuests: 4,
      });
      expect(result.available).toBe(false);
      expect(result.reasons.some((r) => r.code === "GUEST_COUNT_EXCEEDED")).toBe(true);
    });

    it("enforces min nights for future", () => {
      const result = evaluate("2026-11-10", "2026-11-12", {
        policy: "csv_import_future",
        rules: { ...strictRules, checkInDays: [0, 1, 2, 3, 4, 5, 6], checkOutDays: [0, 1, 2, 3, 4, 5, 6], advanceMinDays: 0, advanceMaxDays: 365 },
      });
      expect(result.available).toBe(false);
      expect(result.reasons.some((r) => r.code === "MIN_NIGHTS")).toBe(true);
    });
  });
});
