/**
 * Provider-1 P1-S2 — infrastructure-local fetch errors.
 * Stable codes for tests; messages must never include URL, Location, body, or secrets.
 */

export type IcalFeedFetchErrorCode =
  | "ICAL_FEED_URL_INVALID"
  | "ICAL_FEED_SSRF_REJECTED"
  | "ICAL_FEED_NETWORK_FAILURE"
  | "ICAL_FEED_TIMEOUT"
  | "ICAL_FEED_REDIRECT_REJECTED"
  | "ICAL_FEED_UNEXPECTED_STATUS"
  | "ICAL_FEED_RESPONSE_TOO_LARGE"
  | "ICAL_FEED_CONTENT_TYPE_REJECTED"
  | "ICAL_FEED_CONTENT_ENCODING_REJECTED"
  | "ICAL_FEED_INCOMPLETE_RESPONSE"
  | "ICAL_FEED_HEADERS_INVALID";

export class IcalFeedFetchError extends Error {
  readonly code: IcalFeedFetchErrorCode;
  readonly statusCode?: number;
  readonly redirectHop?: number;
  readonly byteLength?: number;

  constructor(
    code: IcalFeedFetchErrorCode,
    message: string,
    meta: { statusCode?: number; redirectHop?: number; byteLength?: number } = {},
  ) {
    super(message);
    this.name = "IcalFeedFetchError";
    this.code = code;
    this.statusCode = meta.statusCode;
    this.redirectHop = meta.redirectHop;
    this.byteLength = meta.byteLength;
  }
}

export function isIcalFeedFetchError(error: unknown): error is IcalFeedFetchError {
  return error instanceof IcalFeedFetchError;
}
