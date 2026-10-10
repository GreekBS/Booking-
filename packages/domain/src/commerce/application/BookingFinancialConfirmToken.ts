export const BOOKING_FINANCIAL_CONFIRM_TYP = "booking_financial_reprice" as const;
export const BOOKING_FINANCIAL_CONFIRM_TTL_SECONDS = 10 * 60;

export interface BookingFinancialConfirmClaims {
  typ: typeof BOOKING_FINANCIAL_CONFIRM_TYP;
  v: 1;
  tenantId: string;
  propertyId: string;
  bookingId: string;
  actorId: string;
  pricingIntent: "recalculate_from_rate_plan";
  currentQuoteId: string;
  currentSnapshotId: string;
  currentTotalAmount: string;
  currency: string;
  unitId: string;
  checkIn: string;
  checkOut: string;
  guestCount: number;
  proposedTotalAmount: string;
  proposedSubtotalAmount: string;
  proposedFeesAmount: string;
  proposedTaxesAmount: string;
  proposedDiscountAmount: string;
  /** Fingerprint of RatePlan content + proposed commercial amounts + stay geometry. */
  pricingFingerprint: string;
  reasonHash: string;
  iat: number;
  exp: number;
}

export interface IBookingFinancialConfirmTokenService {
  issue(
    claims: Omit<BookingFinancialConfirmClaims, "typ" | "v" | "iat" | "exp"> & {
      now?: Date;
      ttlSeconds?: number;
    },
  ): { token: string; claims: BookingFinancialConfirmClaims };

  /**
   * Cryptographic validity only: HMAC + required claim shape.
   * Does **not** enforce `exp`. Used by apply so an already-committed
   * amendment can be replayed after wall-clock expiry.
   */
  verifySignature(token: string): BookingFinancialConfirmClaims | null;

  /**
   * Full verification: signature + claims + expiry.
   * Prefer for preview issuance consumers that must reject expired tokens.
   */
  verify(token: string, now?: Date): BookingFinancialConfirmClaims | null;
}

/** True when claim `exp` is strictly before `now` (unix seconds). */
export function isBookingFinancialConfirmExpired(
  claims: Pick<BookingFinancialConfirmClaims, "exp">,
  now: Date = new Date(),
): boolean {
  return Math.floor(now.getTime() / 1000) > claims.exp;
}

/** Controlled error code for apply attempts blocked until BFS-3. */
export const BFS3_FINANCIAL_APPLY_GATE_MESSAGE =
  "Confirmed booking financial apply is disabled until BFS-3 atomic folio reconciliation is available";
