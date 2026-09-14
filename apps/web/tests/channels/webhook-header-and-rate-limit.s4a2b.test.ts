import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { collectWebhookHeaders } from "@/lib/channels/webhook-raw-body";
import {
  RateLimitedError,
  checkChannelWebhookRateLimit,
  resetChannelTransportRateLimitsForTests,
  setChannelTransportRateLimitMaxBucketsForTests,
} from "@/lib/channels/channel-transport-rate-limit";

const FAKE_WEBHOOK_TOKEN = "Bearer fake-webhook-token";

const isChannelWebhookApiEnabled = vi.fn(() => true);
const handleWebhookExecute = vi.fn();

vi.mock("@/lib/channels/webhook-api", () => ({
  isChannelWebhookApiEnabled: (...args: unknown[]) =>
    isChannelWebhookApiEnabled(...args),
}));

vi.mock("@/lib/di/container", () => ({
  handleChannelWebhookTransportUseCase: {
    execute: (...args: unknown[]) => handleWebhookExecute(...args),
  },
}));

// Real rate limiter — do not mock (proves 429 skips UC).
import { POST as webhookPost } from "@/app/api/channels/v1/webhooks/[provider]/[tenantId]/[connectionId]/route";

const TENANT_ID = "550e8400-e29b-41d4-a716-446655440900";
const CONNECTION_ID = "conn-1";

describe("collectWebhookHeaders (S4a-2b corrective)", () => {
  it("preserves Authorization and signature headers; strips Cookie only", () => {
    const request = new Request("http://localhost/wh", {
      method: "POST",
      headers: {
        authorization: FAKE_WEBHOOK_TOKEN,
        cookie: "session=browser-secret",
        "x-signature": "sig-abc",
        "x-timestamp": "1710000000",
        "content-type": "application/json",
        "x-nonce": "n-1",
      },
    });

    const headers = collectWebhookHeaders(request);

    expect(headers.authorization ?? headers.Authorization).toBe(FAKE_WEBHOOK_TOKEN);
    expect(headers["x-signature"]).toBe("sig-abc");
    expect(headers["x-timestamp"]).toBe("1710000000");
    expect(headers["content-type"]).toBe("application/json");
    expect(headers["x-nonce"]).toBe("n-1");
    expect(headers.cookie ?? headers.Cookie).toBeUndefined();
    expect(JSON.stringify(headers)).not.toContain("browser-secret");
  });
});

describe("webhook route header forwarding + rate limit (real limiter)", () => {
  const context = {
    params: Promise.resolve({
      provider: "ical",
      tenantId: TENANT_ID,
      connectionId: CONNECTION_ID,
    }),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    resetChannelTransportRateLimitsForTests();
    isChannelWebhookApiEnabled.mockReturnValue(true);
    handleWebhookExecute.mockResolvedValue({
      ackAllowed: true,
      ackClassification: "ack_allowed",
      retryClassification: "none",
      results: [],
      receivedMessageCount: 1,
      persistedMessageCount: 1,
    });
  });

  afterEach(() => {
    resetChannelTransportRateLimitsForTests();
  });

  it("forwards Authorization to the transport UC and excludes Cookie", async () => {
    const payload = new Uint8Array([9, 8, 7]);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const request = new NextRequest(
      `http://localhost/api/channels/v1/webhooks/ical/${TENANT_ID}/${CONNECTION_ID}`,
      {
        method: "POST",
        body: payload,
        headers: {
          authorization: FAKE_WEBHOOK_TOKEN,
          cookie: "next-auth.session-token=browser-session",
          "x-signature": "provider-sig",
          "content-type": "application/json",
          "content-length": String(payload.byteLength),
        },
      },
    );

    const response = await webhookPost(request, context);
    expect(response.status).toBe(200);

    const arg = handleWebhookExecute.mock.calls[0]![0] as {
      headers: Record<string, string>;
      rawBodyBytes: Uint8Array;
    };
    expect(arg.headers.authorization ?? arg.headers.Authorization).toBe(
      FAKE_WEBHOOK_TOKEN,
    );
    expect(arg.headers["x-signature"]).toBe("provider-sig");
    expect(arg.headers.cookie ?? arg.headers.Cookie).toBeUndefined();
    expect(Array.from(arg.rawBodyBytes)).toEqual([9, 8, 7]);

    const responseText = await response.text();
    expect(responseText).not.toContain("fake-webhook-token");
    expect(responseText).not.toContain("browser-session");

    const logged = logSpy.mock.calls.map((c) => JSON.stringify(c)).join("\n");
    expect(logged).not.toContain("fake-webhook-token");
    expect(logged).not.toContain("provider-sig");
    expect(logged).not.toContain("browser-session");

    logSpy.mockRestore();
  });

  it("returns 429 without invoking the transport UC when limited", async () => {
    const request = new NextRequest(
      `http://localhost/api/channels/v1/webhooks/ical/${TENANT_ID}/${CONNECTION_ID}`,
      {
        method: "POST",
        body: "{}",
        headers: {
          "content-length": "2",
          "x-forwarded-for": "203.0.113.50",
        },
      },
    );

    for (let i = 0; i < 120; i += 1) {
      checkChannelWebhookRateLimit(request);
    }

    expect(() => checkChannelWebhookRateLimit(request)).toThrow(RateLimitedError);

    const response = await webhookPost(request, context);
    expect(response.status).toBe(429);
    expect(handleWebhookExecute).not.toHaveBeenCalled();

    const body = await response.json();
    expect(body.error.code).toBe("RATE_LIMITED");
    expect(JSON.stringify(body)).not.toContain("fake-webhook-token");
  });

  it("does not reveal target existence on rate-limited public responses", async () => {
    setChannelTransportRateLimitMaxBucketsForTests(8);
    const request = new NextRequest("http://localhost/wh", {
      method: "POST",
      body: "{}",
      headers: {
        "content-length": "2",
        "x-forwarded-for": "203.0.113.77",
      },
    });
    for (let i = 0; i < 121; i += 1) {
      try {
        checkChannelWebhookRateLimit(request);
      } catch {
        // expected once over limit
      }
    }
    const response = await webhookPost(request, context);
    expect(response.status).toBe(429);
    const body = await response.json();
    expect(body.error.message).toBe("Too many requests");
    expect(JSON.stringify(body).toLowerCase()).not.toContain(TENANT_ID.toLowerCase());
  });
});
