import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CHANNEL_TRANSPORT_RATE_LIMIT_MAX_BUCKETS,
  CHANNEL_TRANSPORT_RATE_LIMIT_WINDOW_MS,
  RateLimitedError,
  checkChannelAdminTransportRateLimit,
  checkChannelWebhookRateLimit,
  getChannelTransportRateLimitBucketCountForTests,
  resetChannelTransportRateLimitsForTests,
  setChannelTransportRateLimitMaxBucketsForTests,
  sweepChannelTransportRateLimitsForTests,
} from "@/lib/channels/channel-transport-rate-limit";

function requestWithIp(ip: string): Request {
  return new Request("http://localhost/wh", {
    method: "POST",
    headers: { "x-forwarded-for": ip },
  });
}

describe("channel transport rate limiter (bounded)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-19T12:00:00.000Z"));
    resetChannelTransportRateLimitsForTests();
  });

  afterEach(() => {
    resetChannelTransportRateLimitsForTests();
    vi.useRealTimers();
  });

  it("throttles repeated requests to the same public IP key", () => {
    const request = requestWithIp("203.0.113.10");
    for (let i = 0; i < 120; i += 1) {
      checkChannelWebhookRateLimit(request);
    }
    expect(() => checkChannelWebhookRateLimit(request)).toThrow(RateLimitedError);
  });

  it("allows the same key again after the window expires", () => {
    const request = requestWithIp("203.0.113.11");
    for (let i = 0; i < 120; i += 1) {
      checkChannelWebhookRateLimit(request);
    }
    expect(() => checkChannelWebhookRateLimit(request)).toThrow(RateLimitedError);

    vi.advanceTimersByTime(CHANNEL_TRANSPORT_RATE_LIMIT_WINDOW_MS + 1);
    sweepChannelTransportRateLimitsForTests();

    expect(() => checkChannelWebhookRateLimit(request)).not.toThrow();
  });

  it("evicts expired entries on sweep", () => {
    checkChannelWebhookRateLimit(requestWithIp("203.0.113.12"));
    expect(getChannelTransportRateLimitBucketCountForTests()).toBeGreaterThan(0);

    vi.advanceTimersByTime(CHANNEL_TRANSPORT_RATE_LIMIT_WINDOW_MS + 1);
    sweepChannelTransportRateLimitsForTests();

    expect(getChannelTransportRateLimitBucketCountForTests()).toBe(0);
  });

  it("does not store unbounded buckets for unique route values", () => {
    setChannelTransportRateLimitMaxBucketsForTests(32);
    const request = requestWithIp("203.0.113.20");

    // Historical high-cardinality attack: many distinct route segments.
    // Public limiter keys ignore those segments; only global + one IP are stored.
    for (let i = 0; i < 500; i += 1) {
      try {
        checkChannelWebhookRateLimit(request);
      } catch (error) {
        if (!(error instanceof RateLimitedError)) {
          throw error;
        }
      }
    }

    expect(getChannelTransportRateLimitBucketCountForTests()).toBeLessThanOrEqual(
      2,
    );
  });

  it("keeps map size ≤ hard cap under many unique/spoofed IPs", () => {
    setChannelTransportRateLimitMaxBucketsForTests(64);

    for (let i = 0; i < 500; i += 1) {
      checkChannelWebhookRateLimit(
        requestWithIp(`198.51.100.${i % 256}-${i}`),
      );
    }

    expect(getChannelTransportRateLimitBucketCountForTests()).toBeLessThanOrEqual(
      64,
    );
    expect(getChannelTransportRateLimitBucketCountForTests()).toBeLessThanOrEqual(
      CHANNEL_TRANSPORT_RATE_LIMIT_MAX_BUCKETS,
    );
  });

  it("evicts least-recently-used buckets when at capacity", () => {
    setChannelTransportRateLimitMaxBucketsForTests(4);

    // Fill with four distinct IP buckets (+ shared global = need careful counting).
    // Capacity includes wh:global. Sequence: global + ip0, then ip1.. create pressure.
    checkChannelWebhookRateLimit(requestWithIp("10.0.0.1"));
    vi.advanceTimersByTime(1);
    checkChannelWebhookRateLimit(requestWithIp("10.0.0.2"));
    vi.advanceTimersByTime(1);
    checkChannelWebhookRateLimit(requestWithIp("10.0.0.3"));
    vi.advanceTimersByTime(1);
    // At this point: wh:global, wh:ip:10.0.0.1, wh:ip:10.0.0.2, wh:ip:10.0.0.3 → 4
    expect(getChannelTransportRateLimitBucketCountForTests()).toBe(4);

    // Touch global + ip3 so ip1/ip2 are LRU candidates; insert ip4 must evict.
    vi.advanceTimersByTime(1);
    checkChannelWebhookRateLimit(requestWithIp("10.0.0.3"));
    vi.advanceTimersByTime(1);
    checkChannelWebhookRateLimit(requestWithIp("10.0.0.4"));

    expect(getChannelTransportRateLimitBucketCountForTests()).toBeLessThanOrEqual(
      4,
    );
  });

  it("admin limiter shares the same hard cap", () => {
    setChannelTransportRateLimitMaxBucketsForTests(16);
    for (let i = 0; i < 200; i += 1) {
      checkChannelAdminTransportRateLimit(
        requestWithIp(`10.1.0.${i % 50}`),
        `tenant-${i}`,
        `connection-${i}`,
        "poll",
      );
    }
    expect(getChannelTransportRateLimitBucketCountForTests()).toBeLessThanOrEqual(
      16,
    );
  });

  it("reset clears state between tests", () => {
    checkChannelWebhookRateLimit(requestWithIp("203.0.113.99"), "ical", "t", "c");
    expect(getChannelTransportRateLimitBucketCountForTests()).toBeGreaterThan(0);
    resetChannelTransportRateLimitsForTests();
    expect(getChannelTransportRateLimitBucketCountForTests()).toBe(0);
  });
});
