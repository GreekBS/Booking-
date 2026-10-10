import { describe, expect, it } from "vitest";
import { Booking, Money, Quote } from "../../src/index";
import { PricingCalculator } from "../../src/commerce/pricing/PricingCalculator";
import {
  baseRatePlan,
  createHoldForUnit,
  villaProperty,
  HOLD_CREATED_AT,
  weekendModifierRatePlan,
} from "./fixtures/commerceFixtures";

const UNIT = villaProperty.units[0]!.id;
const PROP = villaProperty.id;
const NOW = new Date(HOLD_CREATED_AT.getTime() + 5 * 60_000);

function bookingFromQuote(quote: Quote, hold: ReturnType<typeof createHoldForUnit>) {
  return Booking.create({
    id: "booking-preserve-1",
    hold,
    quote,
    guest: { name: "Preserve", email: "p@test.com", phone: null },
    confirmationMode: "manual",
    now: NOW,
  });
}

describe("Quote.createForStayChangePreservingTotal BFS-1 integrity", () => {
  it("guest-only change keeps fees, taxes, nights and discount display basis", () => {
    const hold = createHoldForUnit(UNIT, PROP, "2025-08-01", "2025-08-04", {
      now: HOLD_CREATED_AT,
    });
    // Fri/Sat/Sun with weekend modifier → base != adjusted on some nights
    const pricing = new PricingCalculator().calculate(
      weekendModifierRatePlan,
      hold.stayPeriod,
      NOW,
    );
    const quote = Quote.create({
      id: "quote-src",
      snapshotId: "snap-src",
      hold,
      pricing,
      propertyTimezone: villaProperty.timezone,
      feesAmount: "25.0000",
      taxesAmount: "15.0000",
    });
    const booking = bookingFromQuote(quote, hold);

    const next = Quote.createForStayChangePreservingTotal({
      id: "quote-next",
      snapshotId: "snap-next",
      booking,
      command: {
        unitId: UNIT,
        propertyId: PROP,
        checkIn: "2025-08-01",
        checkOut: "2025-08-04",
        guestCount: 5,
      },
      currentQuote: quote,
      propertyTimezone: villaProperty.timezone,
      quotedAt: new Date(),
    });

    expect(next.snapshot.totalAmount).toBe(quote.snapshot.totalAmount);
    expect(next.snapshot.currency).toBe(quote.snapshot.currency);
    expect(next.snapshot.pricingMode).toBe(quote.snapshot.pricingMode);
    expect(next.snapshot.feesAmount).toBe("25.0000");
    expect(next.snapshot.taxesAmount).toBe("15.0000");
    expect(next.snapshot.subtotalAmount).toBe(quote.snapshot.subtotalAmount);
    expect(next.snapshot.lineItems).toEqual(quote.snapshot.lineItems);
    expect(next.snapshot.preservedCommercialEvidence).toBeNull();

    const hadDiscount = quote.snapshot.lineItems.some(
      (l) => Number(l.baseAmount) > Number(l.adjustedAmount),
    );
    const stillHasDiscount = next.snapshot.lineItems.some(
      (l) => Number(l.baseAmount) > Number(l.adjustedAmount),
    );
    // weekend modifier increases, not discounts — ensure we didn't collapse nights
    expect(next.snapshot.lineItems.length).toBe(quote.snapshot.lineItems.length);
    expect(stillHasDiscount).toBe(hadDiscount);
  });

  it("date change preserves money components and stores prior breakdown as evidence", () => {
    const hold = createHoldForUnit(UNIT, PROP, "2025-08-01", "2025-08-04", {
      now: HOLD_CREATED_AT,
    });
    const pricing = new PricingCalculator().calculate(
      baseRatePlan,
      hold.stayPeriod,
      NOW,
    );
    const quote = Quote.create({
      id: "quote-src-2",
      snapshotId: "snap-src-2",
      hold,
      pricing,
      propertyTimezone: villaProperty.timezone,
      feesAmount: "10.0000",
      taxesAmount: "20.0000",
    });
    const booking = bookingFromQuote(quote, hold);
    const priorNights = quote.snapshot.lineItems.map((l) => ({ ...l }));

    const next = Quote.createForStayChangePreservingTotal({
      id: "quote-next-2",
      snapshotId: "snap-next-2",
      booking,
      command: {
        unitId: UNIT,
        propertyId: PROP,
        checkIn: "2025-08-01",
        checkOut: "2025-08-08",
        guestCount: 2,
      },
      currentQuote: quote,
      propertyTimezone: villaProperty.timezone,
      quotedAt: new Date(),
    });

    expect(next.snapshot.totalAmount).toBe(quote.snapshot.totalAmount);
    expect(next.snapshot.feesAmount).toBe("10.0000");
    expect(next.snapshot.taxesAmount).toBe("20.0000");
    expect(next.snapshot.subtotalAmount).toBe(quote.snapshot.subtotalAmount);
    expect(next.snapshot.pricingMode).toBe("talos_calculated");
    // No invented multi-night redistribution
    expect(next.snapshot.lineItems).toHaveLength(1);
    expect(next.snapshot.lineItems[0]!.adjustedAmount).toBe(
      quote.snapshot.subtotalAmount,
    );
    expect(next.snapshot.preservedCommercialEvidence).toMatchObject({
      previousQuoteId: quote.id,
      previousSnapshotId: quote.snapshotId,
      reason: "stay_geometry_changed",
      feesAmount: "10.0000",
      taxesAmount: "20.0000",
      totalAmount: quote.snapshot.totalAmount,
    });
    expect(next.snapshot.preservedCommercialEvidence!.lineItems).toEqual(
      priorNights,
    );
  });

  it("imported_csv provenance and fixed components survive geometry change", () => {
    const hold = createHoldForUnit(UNIT, PROP, "2025-09-01", "2025-09-04", {
      now: HOLD_CREATED_AT,
    });
    const quote = Quote.createFromFixedTotal({
      id: "quote-import",
      snapshotId: "snap-import",
      hold,
      propertyTimezone: villaProperty.timezone,
      total: Money.create("777.2500", "EUR"),
      pricingMode: "imported_csv",
      quotedAt: NOW,
    });
    const booking = bookingFromQuote(quote, hold);

    const next = Quote.createForStayChangePreservingTotal({
      id: "quote-import-next",
      snapshotId: "snap-import-next",
      booking,
      command: {
        unitId: UNIT,
        propertyId: PROP,
        checkIn: "2025-09-02",
        checkOut: "2025-09-06",
        guestCount: 2,
      },
      currentQuote: quote,
      propertyTimezone: villaProperty.timezone,
      quotedAt: new Date(),
    });

    expect(next.snapshot.totalAmount).toBe("777.2500");
    expect(next.snapshot.pricingMode).toBe("imported_csv");
    expect(next.snapshot.feesAmount).toBe(quote.snapshot.feesAmount);
    expect(next.snapshot.taxesAmount).toBe(quote.snapshot.taxesAmount);
    expect(next.snapshot.preservedCommercialEvidence?.pricingMode).toBe(
      "imported_csv",
    );
  });
});
