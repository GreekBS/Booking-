import { describe, it, expect } from "vitest";
import type { Hold } from "../../src/commerce/booking/domain/Hold";
import type { Quote } from "../../src/commerce/booking/domain/Quote";
import { Booking } from "../../src/commerce/booking/domain/Booking";
import { ConflictError, ValidationError } from "../../src/shared/errors/DomainError";
import type { RatePlanProps } from "../../src/commerce/shared/types/CommerceTypes";
import {
  createHoldForUnit,
  createQuoteForHold,
  villaProperty,
  HOLD_CREATED_AT,
  HOLD_EXPIRED_AT,
} from "./fixtures/commerceFixtures";

const ratePlan: RatePlanProps = {
  baseNightlyAmount: "100.0000",
  currency: "EUR",
  seasons: [],
  dowModifiers: [],
  losDiscounts: [],
};

const bookingNow = new Date(HOLD_CREATED_AT.getTime() + 5 * 60_000);

function createBooking(
  hold: Hold,
  quote: Quote,
  confirmationMode: "manual" | "payment_required",
) {
  return Booking.create({
    id: "booking-1",
    hold,
    quote,
    guest: { name: "Jane Doe", email: "jane@example.com", phone: null },
    confirmationMode,
    now: bookingNow,
  });
}

describe("Hold lifecycle", () => {
  it("creates with default TTL and emits HoldCreated", () => {
    const hold = createHoldForUnit(
      villaProperty.units[0].id,
      villaProperty.id,
      "2025-08-01",
      "2025-08-04",
    );
    expect(hold.status).toBe("active");
    expect(hold.pullDomainEvents()[0].eventType).toBe("HoldCreated");
  });

  it("releases active hold", () => {
    const hold = createHoldForUnit(
      villaProperty.units[0].id,
      villaProperty.id,
      "2025-08-01",
      "2025-08-04",
    );
    hold.release();
    expect(hold.status).toBe("released");
    expect(hold.pullDomainEvents()[1].eventType).toBe("HoldReleased");
  });

  it("expires when past TTL", () => {
    const hold = createHoldForUnit(
      villaProperty.units[0].id,
      villaProperty.id,
      "2025-08-01",
      "2025-08-04",
      { now: HOLD_CREATED_AT },
    );
    hold.pullDomainEvents();
    hold.expire(HOLD_EXPIRED_AT);
    expect(hold.status).toBe("expired");
    expect(hold.pullDomainEvents()[0].eventType).toBe("HoldExpired");
  });

  it("rejects expire before TTL elapsed", () => {
    const hold = createHoldForUnit(
      villaProperty.units[0].id,
      villaProperty.id,
      "2025-08-01",
      "2025-08-04",
      { now: HOLD_CREATED_AT },
    );
    expect(() => hold.expire(new Date(HOLD_CREATED_AT.getTime() + 60_000))).toThrow(
      ConflictError,
    );
  });

  it("converts hold when booking is created", () => {
    const hold = createHoldForUnit(
      villaProperty.units[0].id,
      villaProperty.id,
      "2025-08-01",
      "2025-08-04",
    );
    const quote = createQuoteForHold(hold);
    createBooking(hold, quote, "manual");
    expect(hold.status).toBe("converted");
  });

  it("cannot release expired hold", () => {
    const hold = createHoldForUnit(
      villaProperty.units[0].id,
      villaProperty.id,
      "2025-08-01",
      "2025-08-04",
    );
    hold.expire(HOLD_EXPIRED_AT);
    expect(() => hold.release()).toThrow(ConflictError);
  });
});

describe("Quote from hold", () => {
  it("rejects quote for expired hold", () => {
    const hold = createHoldForUnit(
      villaProperty.units[0].id,
      villaProperty.id,
      "2025-08-01",
      "2025-08-04",
      { now: HOLD_CREATED_AT },
    );
    expect(() => createQuoteForHold(hold, ratePlan, HOLD_EXPIRED_AT)).toThrow(ConflictError);
  });
});

describe("Booking confirmation modes", () => {
  it("manual mode: pending then confirmed", () => {
    const hold = createHoldForUnit(
      villaProperty.units[0].id,
      villaProperty.id,
      "2025-08-01",
      "2025-08-04",
    );
    const quote = createQuoteForHold(hold);
    const booking = createBooking(hold, quote, "manual");
    expect(booking.status).toBe("pending");
    booking.confirm();
    expect(booking.status).toBe("confirmed");
  });

  it("payment_required mode: payment_pending then confirmed", () => {
    const hold = createHoldForUnit(
      villaProperty.units[0].id,
      villaProperty.id,
      "2025-08-01",
      "2025-08-04",
    );
    const quote = createQuoteForHold(hold);
    const booking = createBooking(hold, quote, "payment_required");
    expect(booking.status).toBe("payment_pending");
    expect(() => booking.confirm(new Date())).not.toThrow();
    expect(booking.status).toBe("confirmed");
  });

  it("rejects mismatched hold and quote", () => {
    const hold = createHoldForUnit(
      villaProperty.units[0].id,
      villaProperty.id,
      "2025-08-01",
      "2025-08-04",
    );
    const otherHold = createHoldForUnit(
      villaProperty.units[0].id,
      villaProperty.id,
      "2025-08-01",
      "2025-08-04",
      { holdId: "hold-other" },
    );
    const quote = createQuoteForHold(otherHold);
    expect(() => createBooking(hold, quote, "manual")).toThrow(ValidationError);
  });

  it("cancels confirmed booking", () => {
    const hold = createHoldForUnit(
      villaProperty.units[0].id,
      villaProperty.id,
      "2025-08-01",
      "2025-08-04",
    );
    const quote = createQuoteForHold(hold);
    const booking = createBooking(hold, quote, "manual");
    booking.confirm();
    booking.cancel("guest request");
    expect(booking.status).toBe("cancelled");
  });

  it("completes confirmed booking", () => {
    const hold = createHoldForUnit(
      villaProperty.units[0].id,
      villaProperty.id,
      "2025-08-01",
      "2025-08-04",
    );
    const quote = createQuoteForHold(hold);
    const booking = createBooking(hold, quote, "manual");
    booking.confirm();
    booking.complete();
    expect(booking.status).toBe("completed");
  });
});
