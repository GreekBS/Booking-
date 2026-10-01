import { describe, it, expect } from "vitest";
import {
  directBookingQuoteSchema,
  directBookingAvailabilitySchema,
  directBookingPublicKeySchema,
  directBookingCalendarSchema,
  directBookingCreateHoldSchema,
  directBookingCreateBookSchema,
} from "@hcp/validators";

describe("direct booking validators", () => {
  it("accepts valid availability payload", () => {
    const parsed = directBookingAvailabilitySchema.parse({
      checkIn: "2026-10-01",
      checkOut: "2026-10-05",
      guestCount: 2,
    });
    expect(parsed.guestCount).toBe(2);
  });

  it("rejects client-submitted price overrides on quote", () => {
    expect(() =>
      directBookingQuoteSchema.parse({
        checkIn: "2026-10-01",
        checkOut: "2026-10-05",
        guestCount: 2,
        total: "1.00",
      }),
    ).toThrow();
  });

  it("validates opaque public key format", () => {
    expect(
      directBookingPublicKeySchema.safeParse("dbk_live_abcdefghijklmnopqr").success,
    ).toBe(true);
    expect(directBookingPublicKeySchema.safeParse("pk_live_abcdefghijklmnopqr").success).toBe(
      false,
    );
  });

  it("accepts calendar range within cap and rejects oversize", () => {
    expect(
      directBookingCalendarSchema.safeParse({
        from: "2026-12-01",
        to: "2026-12-31",
        guestCount: 2,
      }).success,
    ).toBe(true);
    expect(
      directBookingCalendarSchema.safeParse({
        from: "2026-01-01",
        to: "2026-05-01",
        guestCount: 2,
      }).success,
    ).toBe(false);
  });

  it("accepts hold payload and rejects price/TTL/tenant overrides", () => {
    expect(
      directBookingCreateHoldSchema.safeParse({
        checkIn: "2026-12-10",
        checkOut: "2026-12-13",
        guestCount: 2,
        idempotencyKey: "client-key-123456",
      }).success,
    ).toBe(true);

    expect(
      directBookingCreateHoldSchema.safeParse({
        checkIn: "2026-12-10",
        checkOut: "2026-12-13",
        guestCount: 2,
        idempotencyKey: "client-key-123456",
        total: "1.00",
      }).success,
    ).toBe(false);

    expect(
      directBookingCreateHoldSchema.safeParse({
        checkIn: "2026-12-10",
        checkOut: "2026-12-13",
        guestCount: 2,
        idempotencyKey: "client-key-123456",
        ttlSeconds: 60,
      }).success,
    ).toBe(false);

    expect(
      directBookingCreateHoldSchema.safeParse({
        checkIn: "2026-12-10",
        checkOut: "2026-12-13",
        guestCount: 2,
        idempotencyKey: "client-key-123456",
        propertyId: "1a975f6c-08b5-497d-94a0-777ff09fa618",
      }).success,
    ).toBe(false);
  });

  it("accepts book payload and rejects price/status/stay/terms=false", () => {
    const valid = {
      holdId: "d0ef75e9-63f3-46a0-9fd9-33a5ef374838",
      guest: {
        firstName: "Maria",
        lastName: "Papadopoulos",
        email: "maria@example.com",
        phone: "+306912345678",
        country: "gr",
      },
      acceptedTerms: true,
      idempotencyKey: "book-key-12345678",
    };
    const parsed = directBookingCreateBookSchema.parse(valid);
    expect(parsed.guest.country).toBe("GR");

    expect(
      directBookingCreateBookSchema.safeParse({ ...valid, acceptedTerms: false }).success,
    ).toBe(false);

    expect(
      directBookingCreateBookSchema.safeParse({ ...valid, total: "1.00" }).success,
    ).toBe(false);

    expect(
      directBookingCreateBookSchema.safeParse({ ...valid, quoteId: valid.holdId }).success,
    ).toBe(false);

    expect(
      directBookingCreateBookSchema.safeParse({
        ...valid,
        checkIn: "2026-12-10",
        checkOut: "2026-12-13",
      }).success,
    ).toBe(false);

    expect(
      directBookingCreateBookSchema.safeParse({
        ...valid,
        guestCount: 2,
      }).success,
    ).toBe(false);

    expect(
      directBookingCreateBookSchema.safeParse({
        ...valid,
        status: "confirmed",
      }).success,
    ).toBe(false);

    expect(
      directBookingCreateBookSchema.safeParse({
        ...valid,
        specialRequests: "late arrival",
      }).success,
    ).toBe(false);
  });
});
