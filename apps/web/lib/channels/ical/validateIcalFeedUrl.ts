import { IcalFeedFetchError } from "./icalFeedFetchErrors";
import type { ValidatedIcalFeedUrl } from "./icalFeedFetchTypes";

const IPV4_LITERAL =
  /^(?:\d{1,3}\.){3}\d{1,3}$/;
const IPV6_CANDIDATE = /:|^\[|]$/;

/**
 * Validate and normalize an iCal feed URL for SSRF-safe fetch (P1-S2).
 *
 * Accepts only: https://<dns-hostname>[:443]/...
 * Rejects literals, userinfo, fragments, non-443 ports, and non-https schemes.
 * Trailing DNS dot is stripped so DNS/SNI/Host use one canonical hostname.
 */
export function validateIcalFeedUrl(raw: string): ValidatedIcalFeedUrl {
  if (typeof raw !== "string" || raw.trim() === "") {
    throw new IcalFeedFetchError("ICAL_FEED_URL_INVALID", "Feed URL is invalid");
  }

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new IcalFeedFetchError("ICAL_FEED_URL_INVALID", "Feed URL is invalid");
  }

  if (parsed.protocol !== "https:") {
    throw new IcalFeedFetchError("ICAL_FEED_URL_INVALID", "Feed URL scheme is not allowed");
  }

  if (parsed.username !== "" || parsed.password !== "") {
    throw new IcalFeedFetchError("ICAL_FEED_URL_INVALID", "Feed URL must not include userinfo");
  }

  if (parsed.hash !== "") {
    throw new IcalFeedFetchError("ICAL_FEED_URL_INVALID", "Feed URL must not include a fragment");
  }

  // WHATWG: port "" means default for scheme (443 for https).
  if (parsed.port !== "" && parsed.port !== "443") {
    throw new IcalFeedFetchError("ICAL_FEED_URL_INVALID", "Feed URL port is not allowed");
  }

  let hostname = parsed.hostname;
  if (hostname.startsWith("[") && hostname.endsWith("]")) {
    // Bracketed host is always an IP literal in URLs.
    throw new IcalFeedFetchError("ICAL_FEED_URL_INVALID", "Feed URL must use a DNS hostname");
  }

  // Zone identifiers appear as %25 in URLs (e.g. fe80::1%25eth0) or as raw % in hostname.
  if (hostname.includes("%")) {
    throw new IcalFeedFetchError("ICAL_FEED_URL_INVALID", "Feed URL must use a DNS hostname");
  }

  // Terminal DNS dot → strip for canonical SNI/Host/DNS (deterministic policy).
  if (hostname.endsWith(".")) {
    hostname = hostname.slice(0, -1);
  }

  if (hostname === "" || hostname.includes(":")) {
    throw new IcalFeedFetchError("ICAL_FEED_URL_INVALID", "Feed URL must use a DNS hostname");
  }

  if (IPV4_LITERAL.test(hostname) || IPV6_CANDIDATE.test(hostname)) {
    throw new IcalFeedFetchError("ICAL_FEED_URL_INVALID", "Feed URL must use a DNS hostname");
  }

  // Reject localhost names (not globally routable destinations).
  const lower = hostname.toLowerCase();
  if (lower === "localhost" || lower.endsWith(".localhost")) {
    throw new IcalFeedFetchError("ICAL_FEED_SSRF_REJECTED", "Feed destination is not allowed");
  }

  const pathname = parsed.pathname === "" ? "/" : parsed.pathname;
  const search = parsed.search;
  const requestPath = `${pathname}${search}`;

  return {
    hostname: lower,
    pathname,
    search,
    port: 443,
    requestPath,
  };
}
