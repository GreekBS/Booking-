import { describe, it, expect } from "vitest";
import { Booking } from "../../src/commerce/booking/domain/Booking";
import { Quote } from "../../src/commerce/booking/domain/Quote";
import { Hold } from "../../src/commerce/booking/domain/Hold";
import { PricingCalculator } from "../../src/commerce/pricing/PricingCalculator";
import { ConflictError } from "../../src/shared/errors/DomainError";
import {
  baseRatePlan,
  createHoldForUnit,
  villaProperty,
  HOLD_CREATED_AT,
} from "./fixtures/commerceFixtures";

const pricingCalculator = new PricingCalculator();
const bookingNow = new Date(HOLD_CREATED_AT.getTime() + 5 * 60_000);

function createBooking() {
  const hold = createHoldForUnit(
    villaProperty.units[0].id,
    villaProperty.id,
    "2025-08-01",
    "2025-08-04",
    { now: HOLD_CREATED_AT },
  );
  const pricing = pricingCalculator.calculate(
    baseRatePlan,
    hold.stayPeriod,
    bookingNow,
  );
  const quote = Quote.create({
    id: "quote-1",
    snapshotId: "snap-1",
    hold,
    pricing,
    propertyTimezone: villaProperty.timezone,
  });
  return Booking.create({
    id: "booking-1",
    hold,
    quote,
    guest: { name: "Jane Doe", email: "jane@example.com", phone: null },
    confirmationMode: "manual",
    now: bookingNow,
  });
}

function createAmendQuote(booking: Booking, checkIn: string, checkOut: string) {
  const hold = Hold.create({
    id: "hold-amend",
    tenantId: booking.tenantId,
    unitId: booking.unitId,
    propertyId: booking.propertyId,
    checkIn,
    checkOut,
    guestCount: booking.guestCount.value,
    now: bookingNow,
  });
  const pricing = pricingCalculator.calculate(
    baseRatePlan,
    hold.stayPeriod,
    bookingNow,
  );
  return Quote.createForStayChange({
    id: "quote-2",
    snapshotId: "snap-2",
    booking,
    command: {
      unitId: booking.unitId,
      propertyId: booking.propertyId,
      checkIn,
      checkOut,
      guestCount: booking.guestCount.value,
    },
    pricing,
    propertyTimezone: villaProperty.timezone,
  });
}

describe("Booking.applyStayChange", () => {
  it("updates stay fields and emits granular events", () => {
    const booking = createBooking();
    const quote = createAmendQuote(booking, "2025-08-01", "2025-08-06");

    booking.applyStayChange(
      {
        unitId: booking.unitId,
        propertyId: booking.propertyId,
        checkIn: "2025-08-01",
        checkOut: "2025-08-06",
        guestCount: booking.guestCount.value,
      },
      quote,
      bookingNow,
    );

    expect(booking.stayPeriod.checkOut.value).toBe("2025-08-06");
    expect(booking.quoteId).toBe("quote-2");

    const events = booking.pullDomainEvents();
    expect(events.some((e) => e.eventType === "BookingStayChanged")).toBe(true);
  });

  it("rejects terminal bookings", () => {
    const booking = createBooking();
    booking.cancel();
    const quote = createAmendQuote(booking, "2025-08-01", "2025-08-05");

    expect(() =>
      booking.applyStayChange(
        {
          unitId: booking.unitId,
          propertyId: booking.propertyId,
          checkIn: "2025-08-01",
          checkOut: "2025-08-05",
          guestCount: booking.guestCount.value,
        },
        quote,
      ),
    ).toThrow(ConflictError);
  });
});
