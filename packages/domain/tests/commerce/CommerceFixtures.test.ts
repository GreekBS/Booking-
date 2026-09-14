import { describe, it, expect } from "vitest";
import {
  villaProperty,
  hotelProperty,
  blockedDates,
  createExpiredHold,
  createPaymentPendingBooking,
  createHoldForUnit,
  createQuoteForHold,
  evaluateAvailability,
  highSeasonRatePlan,
  weekendModifierRatePlan,
  defaultAvailabilityRules,
} from "./fixtures/commerceFixtures";
import { PricingCalculator } from "../../src/commerce/pricing/PricingCalculator";
import { StayPeriod } from "../../src/commerce/shared/value-objects/StayPeriod";
import { ConflictError } from "../../src/shared/errors/DomainError";

describe("Commerce fixtures", () => {
  it("models villa with single bookable unit", () => {
    expect(villaProperty.units).toHaveLength(1);
    expect(villaProperty.units[0].maxGuests).toBe(6);
  });

  it("models hotel with multiple independent units", () => {
    expect(hotelProperty.units).toHaveLength(3);
    expect(new Set(hotelProperty.units.map((u) => u.id)).size).toBe(3);
  });

  it("applies high season pricing fixture", () => {
    const stay = StayPeriod.create("2025-07-20", "2025-07-22");
    const result = new PricingCalculator().calculate(
      highSeasonRatePlan,
      stay,
      new Date("2025-06-01T12:00:00.000Z"),
    );
    expect(result.subtotal.amount).toBe("360.0000");
  });

  it("applies weekend modifier fixture", () => {
    const stay = StayPeriod.create("2025-06-06", "2025-06-08");
    const result = new PricingCalculator().calculate(
      weekendModifierRatePlan,
      stay,
      new Date("2025-06-01T12:00:00.000Z"),
    );
    expect(result.lineItems[0].adjustedAmount).toBe("120.0000");
    expect(result.lineItems[1].adjustedAmount).toBe("130.0000");
  });

  it("blocks dates via fixture calendar blocks", () => {
    const result = evaluateAvailability(
      villaProperty.units[0].maxGuests,
      "2025-08-12",
      "2025-08-14",
      defaultAvailabilityRules,
      blockedDates,
    );
    expect(result.available).toBe(false);
  });

  it("provides expired hold fixture", () => {
    const hold = createExpiredHold();
    expect(hold.status).toBe("expired");
    expect(() => hold.assertValidForQuote()).toThrow(ConflictError);
  });

  it("provides payment pending booking fixture", () => {
    const booking = createPaymentPendingBooking();
    expect(booking.status).toBe("payment_pending");
    expect(booking.confirmationMode).toBe("payment_required");
  });

  it("leaves hold active until booking converts it", () => {
    const hold = createHoldForUnit(
      villaProperty.units[0].id,
      villaProperty.id,
      "2025-08-01",
      "2025-08-04",
    );
    createQuoteForHold(hold);
    expect(hold.status).toBe("active");
  });
});
