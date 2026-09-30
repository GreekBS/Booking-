import { describe, it, expect } from "vitest";
import {
  directBookingQuoteSchema,
  directBookingAvailabilitySchema,
  directBookingPublicKeySchema,
  directBookingCalendarSchema,
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
});
