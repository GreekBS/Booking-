import { describe, expect, it, vi } from "vitest";
import { Quote } from "../../src/commerce/booking/domain/Quote";
import { QuoteSnapshot } from "../../src/commerce/booking/domain/QuoteSnapshot";
import { Booking } from "../../src/commerce/booking/domain/Booking";
import { Money } from "../../src/commerce/shared/value-objects/Money";
import { StayPricingEngine } from "../../src/commerce/reservation/engines/StayPricingEngine";
import { ValidationError } from "../../src/shared/errors/DomainError";
import {
  createHoldForUnit,
  createQuoteForHold,
  villaProperty,
  HOLD_CREATED_AT,
} from "./fixtures/commerceFixtures";

const bookingNow = new Date(HOLD_CREATED_AT.getTime() + 5 * 60_000);

describe("Quote.createFromFixedTotal", () => {
  it("preserves imported EUR total exactly with imported_csv provenance", () => {
    const hold = createHoldForUnit(
      villaProperty.units[0].id,
      villaProperty.id,
      "2026-11-10",
      "2026-11-15",
    );
    const quote = Quote.createFromFixedTotal({
      id: "quote-fixed-1",
      snapshotId: "snap-fixed-1",
      hold,
      propertyTimezone: "Europe/Athens",
      total: Money.create("850.00", "EUR"),
      pricingMode: "imported_csv",
      quotedAt: bookingNow,
    });

    expect(quote.snapshot.totalAmount).toBe("850.0000");
    expect(quote.snapshot.currency).toBe("EUR");
    expect(quote.snapshot.pricingMode).toBe("imported_csv");
    expect(quote.snapshot.subtotalAmount).toBe("850.0000");
  });

  it("preserves another valid Money currency without FX", () => {
    const hold = createHoldForUnit(
      villaProperty.units[0].id,
      villaProperty.id,
      "2026-11-10",
      "2026-11-15",
    );
    const quote = Quote.createFromFixedTotal({
      id: "quote-usd",
      snapshotId: "snap-usd",
      hold,
      propertyTimezone: "Europe/Athens",
      total: Money.create("1200.50", "USD"),
      pricingMode: "imported_csv",
      quotedAt: bookingNow,
    });

    expect(quote.snapshot.totalAmount).toBe("1200.5000");
    expect(quote.snapshot.currency).toBe("USD");
  });

  it("supports operator_entered provenance", () => {
    const hold = createHoldForUnit(
      villaProperty.units[0].id,
      villaProperty.id,
      "2026-11-10",
      "2026-11-15",
    );
    const quote = Quote.createFromFixedTotal({
      id: "quote-op",
      snapshotId: "snap-op",
      hold,
      propertyTimezone: "Europe/Athens",
      total: Money.create("900.00", "EUR"),
      pricingMode: "operator_entered",
      quotedAt: bookingNow,
    });
    expect(quote.snapshot.pricingMode).toBe("operator_entered");
  });

  it("does not require StayPricingEngine", () => {
    const spy = vi.spyOn(StayPricingEngine.prototype, "priceStay");
    const hold = createHoldForUnit(
      villaProperty.units[0].id,
      villaProperty.id,
      "2026-11-10",
      "2026-11-15",
    );
    Quote.createFromFixedTotal({
      id: "quote-no-engine",
      snapshotId: "snap-no-engine",
      hold,
      propertyTimezone: "Europe/Athens",
      total: Money.create("100.00", "EUR"),
      pricingMode: "imported_csv",
      quotedAt: bookingNow,
    });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("rejects zero and negative totals", () => {
    const hold = createHoldForUnit(
      villaProperty.units[0].id,
      villaProperty.id,
      "2026-11-10",
      "2026-11-15",
    );
    expect(() =>
      Quote.createFromFixedTotal({
        id: "q0",
        snapshotId: "s0",
        hold,
        propertyTimezone: "Europe/Athens",
        total: Money.create("0", "EUR"),
        pricingMode: "imported_csv",
        quotedAt: bookingNow,
      }),
    ).toThrow(ValidationError);

    expect(() =>
      Quote.createFromFixedTotal({
        id: "qneg",
        snapshotId: "sneg",
        hold,
        propertyTimezone: "Europe/Athens",
        total: Money.create("-10.00", "EUR"),
        pricingMode: "imported_csv",
        quotedAt: bookingNow,
      }),
    ).toThrow(ValidationError);
  });

  it("rejects invalid Money currency via Money.create", () => {
    expect(() => Money.create("10.00", "EU")).toThrow(ValidationError);
  });

  it("keeps normal RatePlan Quote as talos_calculated", () => {
    const hold = createHoldForUnit(
      villaProperty.units[0].id,
      villaProperty.id,
      "2025-08-01",
      "2025-08-04",
    );
    const quote = createQuoteForHold(hold);
    expect(quote.snapshot.pricingMode).toBe("talos_calculated");
  });

  it("Booking commercial totals resolve from imported Quote snapshot", () => {
    const hold = createHoldForUnit(
      villaProperty.units[0].id,
      villaProperty.id,
      "2026-11-10",
      "2026-11-15",
    );
    const quote = Quote.createFromFixedTotal({
      id: "quote-book",
      snapshotId: "snap-book",
      hold,
      propertyTimezone: "Europe/Athens",
      total: Money.create("850.00", "EUR"),
      pricingMode: "imported_csv",
      quotedAt: bookingNow,
    });
    const booking = Booking.create({
      id: "booking-imported-price",
      hold,
      quote,
      guest: { name: "Guest", email: "g@example.com", phone: null },
      confirmationMode: "manual",
      now: bookingNow,
    });
    expect(booking.quoteId).toBe(quote.id);
    expect(quote.snapshot.totalAmount).toBe("850.0000");
    expect(quote.snapshot.currency).toBe("EUR");
  });

  it("snapshot round-trip preserves pricing provenance", () => {
    const hold = createHoldForUnit(
      villaProperty.units[0].id,
      villaProperty.id,
      "2026-11-10",
      "2026-11-15",
    );
    const quote = Quote.createFromFixedTotal({
      id: "quote-rt",
      snapshotId: "snap-rt",
      hold,
      propertyTimezone: "Europe/Athens",
      total: Money.create("850.00", "EUR"),
      pricingMode: "imported_csv",
      quotedAt: bookingNow,
    });
    const json = quote.snapshot.toJSON();
    const restored = QuoteSnapshot.create(json);
    expect(restored.pricingMode).toBe("imported_csv");
    expect(restored.totalAmount).toBe("850.0000");
    expect(restored.currency).toBe("EUR");
  });

  it("legacy v1 snapshots without pricingMode default to talos_calculated", () => {
    const legacy = QuoteSnapshot.create({
      version: 1,
      checkIn: "2025-08-01",
      checkOut: "2025-08-04",
      propertyTimezone: "Europe/Athens",
      currency: "EUR",
      lineItems: [
        {
          date: "2025-08-01",
          baseAmount: "100.0000",
          adjustedAmount: "100.0000",
          currency: "EUR",
        },
      ],
      subtotalAmount: "300.0000",
      feesAmount: "0.0000",
      taxesAmount: "0.0000",
      totalAmount: "300.0000",
      quotedAt: new Date("2025-06-01T00:00:00.000Z"),
      // no pricingMode
    });
    expect(legacy.pricingMode).toBe("talos_calculated");
    const roundTrip = QuoteSnapshot.create(legacy.toJSON());
    expect(roundTrip.pricingMode).toBe("talos_calculated");
  });
});
