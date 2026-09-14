import { createIcalProviderRegistration } from "../../../../src/channels";
import type { IIcalFeedFetcher } from "../../../../src/channels/providers/ical/ports/IIcalFeedFetcher";
import { createMockIcalFeedFetcher } from "./mockIcalFeedFetcher";

export function createTestIcalProviderRegistration(
  feedFetcher:
    | IIcalFeedFetcher
    | Uint8Array
    | ((feedUrl: string) => Uint8Array | Promise<Uint8Array>),
) {
  const resolved =
    feedFetcher instanceof Uint8Array
      ? createMockIcalFeedFetcher(() => feedFetcher)
      : typeof feedFetcher === "function"
        ? createMockIcalFeedFetcher(feedFetcher)
        : feedFetcher;
  return createIcalProviderRegistration({ feedFetcher: resolved });
}
