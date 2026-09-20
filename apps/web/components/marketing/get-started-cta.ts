"use client";

import { useOptionalMarketingFunnel } from "./MarketingFunnelProvider";
import { parseLeadSourceParam, parseOptionalUtm } from "@/lib/marketing/lead-source";
import type { LeadSource } from "@hcp/domain";

export { useOptionalMarketingFunnel };

export type ParsedGetStartedHref = {
  source: LeadSource;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
};

/**
 * Parse `/get-started?source=...` CTA hrefs into overlay options.
 * Returns null when the href is not a Get Started acquisition link.
 */
export function parseGetStartedHref(href: string): ParsedGetStartedHref | null {
  if (!href.startsWith("/get-started")) return null;
  try {
    const url = new URL(href, "https://talos.local");
    if (url.pathname !== "/get-started") return null;
    return {
      source: parseLeadSourceParam(url.searchParams.get("source")),
      utmSource: parseOptionalUtm(url.searchParams.get("utm_source")),
      utmMedium: parseOptionalUtm(url.searchParams.get("utm_medium")),
      utmCampaign: parseOptionalUtm(url.searchParams.get("utm_campaign")),
    };
  } catch {
    return {
      source: "other",
      utmSource: null,
      utmMedium: null,
      utmCampaign: null,
    };
  }
}
