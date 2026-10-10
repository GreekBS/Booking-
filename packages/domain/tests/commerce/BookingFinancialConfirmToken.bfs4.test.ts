import { describe, expect, it } from "vitest";
import {
  isBookingFinancialConfirmExpired,
  type BookingFinancialConfirmClaims,
} from "../../src/index";

function claims(exp: number): Pick<BookingFinancialConfirmClaims, "exp"> {
  return { exp };
}

describe("BFS-4 booking financial confirm expiry helper", () => {
  it("treats exp equal to now as not expired (inclusive remaining second)", () => {
    const now = new Date("2026-01-01T00:00:10.000Z");
    const exp = Math.floor(now.getTime() / 1000);
    expect(isBookingFinancialConfirmExpired(claims(exp), now)).toBe(false);
  });

  it("treats exp before now as expired", () => {
    const now = new Date("2026-01-01T00:00:10.000Z");
    const exp = Math.floor(now.getTime() / 1000) - 1;
    expect(isBookingFinancialConfirmExpired(claims(exp), now)).toBe(true);
  });
});
