import type { IIcalFeedFetcher } from "../../../../src/channels/providers/ical/ports/IIcalFeedFetcher";

export function createMockIcalFeedFetcher(
  resolver: (feedUrl: string) => Uint8Array | Promise<Uint8Array>,
): IIcalFeedFetcher {
  return {
    async fetch(feedUrl) {
      return {
        body: await resolver(feedUrl),
        contentType: "text/calendar",
      };
    },
  };
}

export function createStaticIcalFeedFetcher(body: Uint8Array): IIcalFeedFetcher {
  return createMockIcalFeedFetcher(() => body);
}
