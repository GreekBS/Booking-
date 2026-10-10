import { describe, expect, it } from "vitest";
import {
  BOOKING_FINANCIAL_CONFIRM_TYP,
  hashFinancialReason,
} from "@hcp/domain";
import { HmacBookingFinancialConfirmTokenService } from "@/lib/pricing/booking-financial-confirm-token";

describe("HmacBookingFinancialConfirmTokenService", () => {
  const service = new HmacBookingFinancialConfirmTokenService(
    "test-booking-financial-hmac",
  );

  const base = {
    tenantId: "11111111-1111-4111-8111-111111111111",
    propertyId: "22222222-2222-4222-8222-222222222222",
    bookingId: "33333333-3333-4333-8333-333333333333",
    actorId: "actor-1",
    pricingIntent: "recalculate_from_rate_plan" as const,
    currentQuoteId: "44444444-4444-4444-8444-444444444444",
    currentSnapshotId: "55555555-5555-4555-8555-555555555555",
    currentTotalAmount: "300.0000",
    currency: "EUR",
    unitId: "66666666-6666-4666-8666-666666666666",
    checkIn: "2025-08-01",
    checkOut: "2025-08-05",
    guestCount: 2,
    proposedTotalAmount: "600.0000",
    proposedSubtotalAmount: "600.0000",
    proposedFeesAmount: "0.0000",
    proposedTaxesAmount: "0.0000",
    proposedDiscountAmount: "0.0000",
    pricingFingerprint: "a".repeat(64),
    reasonHash: hashFinancialReason("Unit test reason"),
  };

  it("round-trips a valid token", () => {
    const { token, claims } = service.issue(base);
    expect(claims.typ).toBe(BOOKING_FINANCIAL_CONFIRM_TYP);
    const verified = service.verify(token);
    expect(verified).not.toBeNull();
    expect(verified!.bookingId).toBe(base.bookingId);
    expect(verified!.pricingFingerprint).toBe(base.pricingFingerprint);
  });

  it("rejects expired tokens", () => {
    const { token } = service.issue({
      ...base,
      now: new Date(Date.now() - 30 * 60_000),
      ttlSeconds: 60,
    });
    expect(service.verify(token)).toBeNull();
  });

  it("rejects tampered tokens", () => {
    const { token } = service.issue(base);
    const tampered = `${token.slice(0, -6)}zzzzzz`;
    expect(service.verify(tampered)).toBeNull();
  });

  it("rejects short secrets", () => {
    expect(() => new HmacBookingFinancialConfirmTokenService("short")).toThrow(
      /missing or too short/i,
    );
  });
});
