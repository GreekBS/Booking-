/**
 * Machine-account JWT auth contracts for Booking.com Connectivity.
 * Auth model: client_id + client_secret → token exchange → short-lived JWT Bearer.
 * Not property-user OAuth. No live HTTP in CM-4c-1.
 *
 * @see https://developers.booking.com/connectivity/docs/token-based-authentication
 */

export const BOOKING_COM_TOKEN_EXCHANGE_PATH =
  "/token-based-authentication/exchange" as const;

export const BOOKING_COM_TOKEN_DEFAULT_TTL_SECONDS = 3600 as const;
export const BOOKING_COM_TOKEN_EXCHANGE_RATE_LIMIT_PER_HOUR = 30 as const;

export interface BookingComTokenExchangeRequest {
  readonly clientId: string;
  readonly clientSecret: string;
}

export interface BookingComAccessToken {
  /** Opaque JWT — never log or return to browsers. */
  readonly jwt: string;
  /** Expiry as unix seconds when known; null if not parsed. */
  readonly expiresAtUnixSeconds: number | null;
  /** Response RUID when present. */
  readonly ruid: string | null;
}

export interface IBookingComTokenClient {
  /**
   * Exchange machine-account credentials for a short-lived JWT.
   * Implementations must never log client_secret or jwt.
   */
  exchange(
    request: BookingComTokenExchangeRequest,
  ): Promise<BookingComAccessToken>;
}
