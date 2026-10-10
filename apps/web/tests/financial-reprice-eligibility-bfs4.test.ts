import { describe, expect, it } from "vitest";
import {
  evaluateFinancialRepriceEligibility,
  pricingModeBlockMessage,
} from "@/features/bookings/workspace/lib/financial-reprice-eligibility";

describe("BFS-4 financial reprice eligibility", () => {
  it("hides action when unauthorized", () => {
    const e = evaluateFinancialRepriceEligibility({
      canAdjust: false,
      stayDirty: false,
      bookingStatus: "confirmed",
      pricingMode: "talos_calculated",
      hasQuote: true,
    });
    expect(e.visible).toBe(false);
    expect(e.enabled).toBe(false);
  });

  it("fails closed for unknown legacy pricingMode null", () => {
    expect(pricingModeBlockMessage(null)?.reason).toBe("unknown_pricing_mode");
    const e = evaluateFinancialRepriceEligibility({
      canAdjust: true,
      stayDirty: false,
      bookingStatus: "confirmed",
      pricingMode: null,
      hasQuote: true,
    });
    expect(e.enabled).toBe(false);
    expect(e.blockReason).toBe("unknown_pricing_mode");
    expect(e.message).toMatch(/παλαιά εγγραφή/i);
  });

  it("explains unsupported imported and operator-entered modes", () => {
    expect(pricingModeBlockMessage("imported_csv")?.reason).toBe("imported_csv");
    expect(pricingModeBlockMessage("operator_entered")?.reason).toBe(
      "operator_entered",
    );
  });

  it("disables for dirty stay draft", () => {
    const e = evaluateFinancialRepriceEligibility({
      canAdjust: true,
      stayDirty: true,
      bookingStatus: "confirmed",
      pricingMode: "talos_calculated",
      hasQuote: true,
    });
    expect(e.visible).toBe(true);
    expect(e.enabled).toBe(false);
    expect(e.blockReason).toBe("dirty_stay");
  });

  it("disables terminal lifecycle states", () => {
    for (const status of ["cancelled", "completed"]) {
      const e = evaluateFinancialRepriceEligibility({
        canAdjust: true,
        stayDirty: false,
        bookingStatus: status,
        pricingMode: "talos_calculated",
        hasQuote: true,
      });
      expect(e.enabled).toBe(false);
      expect(e.blockReason).toBe("terminal_status");
    }
  });

  it("enables for confirmed talos_calculated with clean stay", () => {
    const e = evaluateFinancialRepriceEligibility({
      canAdjust: true,
      stayDirty: false,
      bookingStatus: "confirmed",
      pricingMode: "talos_calculated",
      hasQuote: true,
    });
    expect(e.visible).toBe(true);
    expect(e.enabled).toBe(true);
    expect(e.blockReason).toBeNull();
  });
});
