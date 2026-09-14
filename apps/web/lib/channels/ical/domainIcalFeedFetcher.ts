import type { IIcalFeedFetcher } from "@hcp/domain";
import { NodeSsrfSafeIcalFeedFetcher } from "./NodeSsrfSafeIcalFeedFetcher";

const nodeFetcher = new NodeSsrfSafeIcalFeedFetcher();

/** Web adapter: SSRF-safe fetch implementation for domain `IIcalFeedFetcher`. */
export const domainIcalFeedFetcher: IIcalFeedFetcher = {
  async fetch(feedUrl) {
    const result = await nodeFetcher.fetch(feedUrl);
    return {
      body: result.body,
      contentType: result.contentType,
    };
  },
};
