import { describe, expect, it } from "vitest";
import { IcalFeedFetchError } from "@/lib/channels/ical/icalFeedFetchErrors";
import { validateIcalFeedUrl } from "@/lib/channels/ical/validateIcalFeedUrl";

describe("validateIcalFeedUrl (P1-S2)", () => {
  it("accepts https hostname with omitted port", () => {
    const v = validateIcalFeedUrl("https://calendar.example.com/feed.ics");
    expect(v.hostname).toBe("calendar.example.com");
    expect(v.port).toBe(443);
    expect(v.requestPath).toBe("/feed.ics");
  });

  it("accepts explicit port 443", () => {
    const v = validateIcalFeedUrl("https://calendar.example.com:443/x");
    expect(v.port).toBe(443);
    expect(v.hostname).toBe("calendar.example.com");
  });

  it("strips terminal DNS dot for canonical hostname", () => {
    const v = validateIcalFeedUrl("https://calendar.example.com./feed");
    expect(v.hostname).toBe("calendar.example.com");
  });

  it("lowercases hostname", () => {
    const v = validateIcalFeedUrl("https://Calendar.Example.COM/Feed");
    expect(v.hostname).toBe("calendar.example.com");
    expect(v.requestPath).toBe("/Feed");
  });

  it("rejects malformed URL", () => {
    expect(() => validateIcalFeedUrl("not a url")).toThrow(IcalFeedFetchError);
    expect(() => validateIcalFeedUrl("not a url")).toThrow(
      expect.objectContaining({ code: "ICAL_FEED_URL_INVALID" }),
    );
  });

  it("rejects relative URL", () => {
    expect(() => validateIcalFeedUrl("/feed.ics")).toThrow(
      expect.objectContaining({ code: "ICAL_FEED_URL_INVALID" }),
    );
  });

  it("rejects http and other schemes", () => {
    expect(() => validateIcalFeedUrl("http://calendar.example.com/feed")).toThrow(
      expect.objectContaining({ code: "ICAL_FEED_URL_INVALID" }),
    );
    expect(() => validateIcalFeedUrl("file:///tmp/x.ics")).toThrow(
      expect.objectContaining({ code: "ICAL_FEED_URL_INVALID" }),
    );
  });

  it("rejects userinfo", () => {
    expect(() => validateIcalFeedUrl("https://user:pass@calendar.example.com/feed")).toThrow(
      expect.objectContaining({ code: "ICAL_FEED_URL_INVALID" }),
    );
  });

  it("rejects fragment", () => {
    expect(() => validateIcalFeedUrl("https://calendar.example.com/feed#x")).toThrow(
      expect.objectContaining({ code: "ICAL_FEED_URL_INVALID" }),
    );
  });

  it("rejects configured IPv4 literal", () => {
    expect(() => validateIcalFeedUrl("https://8.8.8.8/feed")).toThrow(
      expect.objectContaining({ code: "ICAL_FEED_URL_INVALID" }),
    );
  });

  it("rejects configured IPv6 literal", () => {
    expect(() => validateIcalFeedUrl("https://[2001:4860:4860::8888]/feed")).toThrow(
      expect.objectContaining({ code: "ICAL_FEED_URL_INVALID" }),
    );
  });

  it("rejects IPv6 zone identifier forms", () => {
    expect(() => validateIcalFeedUrl("https://fe80::1%25eth0/feed")).toThrow(
      expect.objectContaining({ code: "ICAL_FEED_URL_INVALID" }),
    );
  });

  it("rejects non-443 ports", () => {
    expect(() => validateIcalFeedUrl("https://calendar.example.com:8443/feed")).toThrow(
      expect.objectContaining({ code: "ICAL_FEED_URL_INVALID" }),
    );
    expect(() => validateIcalFeedUrl("https://calendar.example.com:22/feed")).toThrow(
      expect.objectContaining({ code: "ICAL_FEED_URL_INVALID" }),
    );
  });

  it("rejects localhost names", () => {
    expect(() => validateIcalFeedUrl("https://localhost/feed")).toThrow(
      expect.objectContaining({ code: "ICAL_FEED_SSRF_REJECTED" }),
    );
    expect(() => validateIcalFeedUrl("https://app.localhost/feed")).toThrow(
      expect.objectContaining({ code: "ICAL_FEED_SSRF_REJECTED" }),
    );
  });
});
