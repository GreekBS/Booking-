import { describe, expect, it } from "vitest";
import {
  BOOKING_FINANCIAL_CONFIRM_TYP,
  isBookingFinancialConfirmExpired,
} from "@hcp/domain";
import { HmacBookingFinancialConfirmTokenService } from "@/lib/pricing/booking-financial-confirm-token";

describe("BFS-4 HmacBookingFinancialConfirmTokenService", () => {
  const service = new HmacBookingFinancialConfirmTokenService(
    "test-booking-financial-confirm-secret",
  );

  const baseInput = {
    tenantId: "11111111-1111-4111-8111-111111111111",
    propertyId: "22222222-2222-4222-8222-222222222222",
    bookingId: "33333333-3333-4333-8333-333333333333",
    actorId: "44444444-4444-4444-8444-444444444444",
    currentQuoteId: "55555555-5555-4555-8555-555555555555",
    currentSnapshotId: "66666666-6666-4666-8666-666666666666",
    currentTotalAmount: "300.0000",
    currency: "EUR",
    unitId: "77777777-7777-4777-8777-777777777777",
    checkIn: "2026-08-01",
    checkOut: "2026-08-04",
    guestCount: 2,
    proposedTotalAmount: "450.0000",
    proposedSubtotalAmount: "450.0000",
    proposedFeesAmount: "0.0000",
    proposedTaxesAmount: "0.0000",
    proposedDiscountAmount: "0.0000",
    pricingFingerprint: "a".repeat(64),
    reasonHash: "b".repeat(64),
  };

  it("verifySignature accepts cryptographically valid expired tokens", () => {
    const issuedAt = new Date("2026-01-01T00:00:00.000Z");
    const { token, claims } = service.issue({
      ...baseInput,
      now: issuedAt,
      ttlSeconds: 1,
    });
    expect(claims.typ).toBe(BOOKING_FINANCIAL_CONFIRM_TYP);

    const later = new Date("2026-01-01T00:00:05.000Z");
    expect(isBookingFinancialConfirmExpired(claims, later)).toBe(true);
    expect(service.verify(token, later)).toBeNull();
    expect(service.verifySignature(token)?.bookingId).toBe(baseInput.bookingId);
  });

  it("verifySignature rejects tampered signatures", () => {
    const { token } = service.issue({
      ...baseInput,
      now: new Date("2026-01-01T00:00:00.000Z"),
      ttlSeconds: 60,
    });
    expect(service.verifySignature(`${token}x`)).toBeNull();
  });
});
