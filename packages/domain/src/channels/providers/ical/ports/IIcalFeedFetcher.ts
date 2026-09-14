/** Domain port for SSRF-safe iCal feed fetch (implementation lives in apps/web). */

export interface IcalFeedFetchResult {
  readonly body: Uint8Array;
  readonly contentType: string | null;
}

export interface IIcalFeedFetcher {
  fetch(feedUrl: string): Promise<IcalFeedFetchResult>;
}
