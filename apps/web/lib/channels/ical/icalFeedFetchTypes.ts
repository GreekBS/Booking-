/**
 * Provider-1 P1-S2 — infrastructure-local iCal feed fetch types.
 * Not exported from @hcp/domain. Live polling does not use this yet.
 */

export interface IcalFeedFetchResult {
  body: Uint8Array;
  contentType: string | null;
}

export interface IcalFeedFetcher {
  fetch(feedUrl: string): Promise<IcalFeedFetchResult>;
}

/** Normalized HTTPS feed URL authority after validation. */
export interface ValidatedIcalFeedUrl {
  /** Canonical hostname without trailing dot; ASCII/punycode form from WHATWG URL. */
  hostname: string;
  pathname: string;
  search: string;
  /** Always 443 for accepted URLs. */
  port: 443;
  /** Absolute https URL string rebuilt without userinfo/fragment (safe for request path only; never log). */
  requestPath: string;
}
