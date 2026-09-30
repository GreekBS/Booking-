import { describe, it, expect } from "vitest";
import {
  directBookingQuoteSchema,
  directBookingAvailabilitySchema,
  directBookingPublicKeySchema,
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
});
