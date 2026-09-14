import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import {
  ForbiddenError,
  NotFoundError,
  Result,
  UnauthorizedError,
  ValidationError,
  ConflictError,
} from "@hcp/domain";

const requireTenantContext = vi.fn();
const getClientIp = vi.fn(() => "127.0.0.1");
const toPermissionActor = vi.fn((actor: unknown) => actor);
const isChannelOperatorApiEnabled = vi.fn(() => true);
const isChannelsPollingEnabled = vi.fn(() => true);
const isChannelInboxReplayApiEnabled = vi.fn(() => true);
const isChannelWebhookApiEnabled = vi.fn(() => true);

const handleWebhookExecute = vi.fn();
const enqueuePollExecute = vi.fn();
const replayExecute = vi.fn();

vi.mock("@/lib/tenant-context", () => ({
  requireTenantContext: (...args: unknown[]) => requireTenantContext(...args),
  getClientIp: (...args: unknown[]) => getClientIp(...args),
  toPermissionActor: (...args: unknown[]) => toPermissionActor(...args),
}));

vi.mock("@/lib/channels/operator-api", () => ({
  isChannelOperatorApiEnabled: (...args: unknown[]) =>
    isChannelOperatorApiEnabled(...args),
}));

vi.mock("@/lib/channels/polling-enabled", () => ({
  isChannelsPollingEnabled: (...args: unknown[]) => isChannelsPollingEnabled(...args),
}));

vi.mock("@/lib/channels/inbox-replay-api", () => ({
  isChannelInboxReplayApiEnabled: (...args: unknown[]) =>
    isChannelInboxReplayApiEnabled(...args),
}));

vi.mock("@/lib/channels/webhook-api", () => ({
  isChannelWebhookApiEnabled: (...args: unknown[]) => isChannelWebhookApiEnabled(...args),
}));

vi.mock("@/lib/di/container", () => ({
  handleChannelWebhookTransportUseCase: {
    execute: (...args: unknown[]) => handleWebhookExecute(...args),
  },
  enqueueChannelConnectionPollUseCase: {
    execute: (...args: unknown[]) => enqueuePollExecute(...args),
  },
  replayChannelConnectionInboxItemUseCase: {
    execute: (...args: unknown[]) => replayExecute(...args),
  },
}));

vi.mock("@/lib/channels/channel-transport-rate-limit", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/channels/channel-transport-rate-limit")
  >("@/lib/channels/channel-transport-rate-limit");
  return {
    ...actual,
    checkChannelWebhookRateLimit: vi.fn(),
    checkChannelAdminTransportRateLimit: vi.fn(),
  };
});

import { POST as webhookPost } from "@/app/api/channels/v1/webhooks/[provider]/[tenantId]/[connectionId]/route";
import { POST as pollPost } from "@/app/api/admin/v1/channel-connections/[connectionId]/poll/route";
import { POST as replayPost } from "@/app/api/admin/v1/channel-connections/[connectionId]/inbox/[inboxItemId]/replay/route";
import {
  CHANNEL_WEBHOOK_MAX_BODY_BYTES,
  readWebhookRawBody,
  WebhookPayloadTooLargeError,
} from "@/lib/channels/webhook-raw-body";
import { mapWebhookTransportResultToHttp } from "@/lib/channels/webhook-http-mapping";
import { resetChannelTransportRateLimitsForTests } from "@/lib/channels/channel-transport-rate-limit";

const TENANT_ID = "550e8400-e29b-41d4-a716-446655440900";
const CONNECTION_ID = "conn-1";
const INBOX_ID = "inbox-1";
const ACTOR_ID = "550e8400-e29b-41d4-a716-446655440902";

const actor = {
  userId: ACTOR_ID,
  email: "admin@example.com",
  platformRole: null,
  activeTenantId: TENANT_ID,
  tenantId: TENANT_ID,
  role: "admin" as const,
  propertyIds: null,
  isSuperAdmin: false,
};

describe("webhook raw body helper", () => {
  it("preserves exact bytes including non-utf8", async () => {
    const bytes = new Uint8Array([0xff, 0x00, 0xfe, 0x01]);
    const request = new Request("http://localhost/wh", {
      method: "POST",
      body: bytes,
      headers: { "content-length": String(bytes.byteLength) },
    });
    const read = await readWebhookRawBody(request);
    expect(Array.from(read)).toEqual(Array.from(bytes));
  });

  it("rejects declared oversized Content-Length before reading", async () => {
    const request = new Request("http://localhost/wh", {
      method: "POST",
      body: "hi",
      headers: { "content-length": String(CHANNEL_WEBHOOK_MAX_BODY_BYTES + 1) },
    });
    await expect(readWebhookRawBody(request)).rejects.toBeInstanceOf(
      WebhookPayloadTooLargeError,
    );
  });

  it("rejects actual oversized body without Content-Length", async () => {
    const big = new Uint8Array(CHANNEL_WEBHOOK_MAX_BODY_BYTES + 10);
    big.fill(7);
    const request = new Request("http://localhost/wh", {
      method: "POST",
      body: big,
    });
    await expect(readWebhookRawBody(request, 100)).rejects.toBeInstanceOf(
      WebhookPayloadTooLargeError,
    );
  });
});

describe("webhook HTTP mapping", () => {
  it("ACKs only when ackAllowed", () => {
    const ok = mapWebhookTransportResultToHttp({
      ackAllowed: true,
      ackClassification: "ack_allowed",
      retryClassification: "none",
      results: [],
      receivedMessageCount: 0,
      persistedMessageCount: 0,
    });
    expect(ok.status).toBe(200);

    const denied = mapWebhookTransportResultToHttp({
      ackAllowed: false,
      ackClassification: "ack_denied",
      failureKind: "verification_failed",
      retryClassification: "none",
      results: [],
      receivedMessageCount: 0,
      persistedMessageCount: 0,
    });
    expect(denied.status).toBe(401);
  });
});

describe("public webhook route (S4a-2b)", () => {
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

  const context = {
    params: Promise.resolve({
      provider: "ical",
      tenantId: TENANT_ID,
      connectionId: CONNECTION_ID,
    }),
  };

  it("returns 404 when flag disabled without invoking UC", async () => {
    isChannelWebhookApiEnabled.mockReturnValue(false);
    const bodySpy = vi.fn();
    const request = new NextRequest("http://localhost/api/channels/v1/webhooks/ical/t/c", {
      method: "POST",
      body: "secret-payload",
    });
    // Ensure we do not consume body when disabled — route returns before read
    Object.defineProperty(request, "arrayBuffer", { value: bodySpy });
    Object.defineProperty(request, "body", {
      get() {
        bodySpy();
        return null;
      },
    });

    const response = await webhookPost(request, context);
    expect(response.status).toBe(404);
    expect(handleWebhookExecute).not.toHaveBeenCalled();
    expect(requireTenantContext).not.toHaveBeenCalled();
  });

  it("does not require session auth and passes raw bytes to UC", async () => {
    const payload = new Uint8Array([1, 2, 3, 4]);
    const request = new NextRequest(
      `http://localhost/api/channels/v1/webhooks/ical/${TENANT_ID}/${CONNECTION_ID}`,
      {
        method: "POST",
        body: payload,
        headers: {
          "content-type": "application/json",
          authorization: "Bearer fake-webhook-token",
          cookie: "session=browser-only",
          "x-signature": "sig-value",
          "content-length": String(payload.byteLength),
        },
      },
    );

    const response = await webhookPost(request, context);
    expect(response.status).toBe(200);
    expect(requireTenantContext).not.toHaveBeenCalled();
    expect(handleWebhookExecute).toHaveBeenCalledTimes(1);
    const arg = handleWebhookExecute.mock.calls[0]![0] as {
      rawBodyBytes: Uint8Array;
      headers: Record<string, string>;
      tenantId: string;
      provider: string;
    };
    expect(Array.from(arg.rawBodyBytes)).toEqual([1, 2, 3, 4]);
    expect(arg.tenantId).toBe(TENANT_ID);
    expect(arg.provider).toBe("ical");
    expect(arg.headers["x-signature"]).toBe("sig-value");
    expect(arg.headers.authorization ?? arg.headers.Authorization).toBe(
      "Bearer fake-webhook-token",
    );
    expect(arg.headers.cookie ?? arg.headers.Cookie).toBeUndefined();
  });

  it("maps verification failure to 401", async () => {
    handleWebhookExecute.mockResolvedValue({
      ackAllowed: false,
      ackClassification: "ack_denied",
      failureKind: "verification_failed",
      retryClassification: "none",
      results: [],
      receivedMessageCount: 0,
      persistedMessageCount: 0,
    });
    const request = new NextRequest("http://localhost/wh", {
      method: "POST",
      body: "{}",
      headers: { "content-length": "2" },
    });
    const response = await webhookPost(request, context);
    expect(response.status).toBe(401);
  });

  it("maps inactive connection to 409", async () => {
    handleWebhookExecute.mockResolvedValue({
      ackAllowed: false,
      ackClassification: "ack_denied",
      failureKind: "inactive_connection",
      retryClassification: "none",
      results: [],
      receivedMessageCount: 0,
      persistedMessageCount: 0,
    });
    const request = new NextRequest("http://localhost/wh", {
      method: "POST",
      body: "{}",
      headers: { "content-length": "2" },
    });
    expect((await webhookPost(request, context)).status).toBe(409);
  });

  it("rejects oversized body with 413 without UC", async () => {
    const request = new NextRequest("http://localhost/wh", {
      method: "POST",
      body: "x",
      headers: { "content-length": String(CHANNEL_WEBHOOK_MAX_BODY_BYTES + 1) },
    });
    const response = await webhookPost(request, context);
    expect(response.status).toBe(413);
    expect(handleWebhookExecute).not.toHaveBeenCalled();
  });

  it("returns 404 for invalid provider param", async () => {
    const response = await webhookPost(
      new NextRequest("http://localhost/wh", { method: "POST", body: "{}" }),
      {
        params: Promise.resolve({
          provider: "not-a-provider",
          tenantId: TENANT_ID,
          connectionId: CONNECTION_ID,
        }),
      },
    );
    expect(response.status).toBe(404);
    expect(handleWebhookExecute).not.toHaveBeenCalled();
  });
});

describe("manual poll route (S4a-2b)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireTenantContext.mockResolvedValue(actor);
    isChannelOperatorApiEnabled.mockReturnValue(true);
    isChannelsPollingEnabled.mockReturnValue(true);
    enqueuePollExecute.mockResolvedValue(
      Result.ok({
        job: {
          id: "job-1",
          tenantId: TENANT_ID,
          jobType: "poll_channel_connection",
          payload: { connectionId: CONNECTION_ID },
          status: "pending",
          priority: 0,
          runAt: new Date(),
          idempotencyKey: `poll_channel_connection:${TENANT_ID}:${CONNECTION_ID}`,
          attemptCount: 0,
          maxAttempts: 5,
        },
      }),
    );
  });

  const context = { params: Promise.resolve({ connectionId: CONNECTION_ID }) };

  it("requires auth before disabled operator gate", async () => {
    isChannelOperatorApiEnabled.mockReturnValue(false);
    requireTenantContext.mockRejectedValue(new UnauthorizedError());
    const response = await pollPost(
      new NextRequest("http://localhost/poll", {
        method: "POST",
        headers: { "x-tenant-id": TENANT_ID },
      }),
      context,
    );
    expect(response.status).toBe(401);
    expect(enqueuePollExecute).not.toHaveBeenCalled();
  });

  it("returns 404 when polling disabled after auth", async () => {
    isChannelsPollingEnabled.mockReturnValue(false);
    const response = await pollPost(
      new NextRequest("http://localhost/poll", {
        method: "POST",
        headers: { "x-tenant-id": TENANT_ID },
      }),
      context,
    );
    expect(response.status).toBe(404);
    expect(enqueuePollExecute).not.toHaveBeenCalled();
  });

  it("enqueues job and returns 202", async () => {
    const response = await pollPost(
      new NextRequest("http://localhost/poll", {
        method: "POST",
        headers: { "x-tenant-id": TENANT_ID },
      }),
      context,
    );
    expect(response.status).toBe(202);
    expect(enqueuePollExecute).toHaveBeenCalledTimes(1);
    const body = await response.json();
    expect(body.status).toBe("queued");
    expect(body.jobId).toBe("job-1");
  });

  it("maps inactive connection to 409", async () => {
    enqueuePollExecute.mockResolvedValue(
      Result.fail(new ConflictError("Channel connection is not active")),
    );
    const response = await pollPost(
      new NextRequest("http://localhost/poll", {
        method: "POST",
        headers: { "x-tenant-id": TENANT_ID },
      }),
      context,
    );
    expect(response.status).toBe(409);
  });

  it("maps missing connection to 404", async () => {
    enqueuePollExecute.mockResolvedValue(
      Result.fail(new NotFoundError("ChannelConnection", CONNECTION_ID)),
    );
    const response = await pollPost(
      new NextRequest("http://localhost/poll", {
        method: "POST",
        headers: { "x-tenant-id": TENANT_ID },
      }),
      context,
    );
    expect(response.status).toBe(404);
  });

  it("maps forbidden to 403", async () => {
    enqueuePollExecute.mockResolvedValue(Result.fail(new ForbiddenError()));
    const response = await pollPost(
      new NextRequest("http://localhost/poll", {
        method: "POST",
        headers: { "x-tenant-id": TENANT_ID },
      }),
      context,
    );
    expect(response.status).toBe(403);
  });
});

describe("replay route (S4a-2b)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireTenantContext.mockResolvedValue(actor);
    isChannelOperatorApiEnabled.mockReturnValue(true);
    isChannelInboxReplayApiEnabled.mockReturnValue(true);
    replayExecute.mockResolvedValue(
      Result.ok({ inboxItemId: "new-inbox", deduplicated: false }),
    );
  });

  const context = {
    params: Promise.resolve({
      connectionId: CONNECTION_ID,
      inboxItemId: INBOX_ID,
    }),
  };

  it("returns 404 when replay flag disabled", async () => {
    isChannelInboxReplayApiEnabled.mockReturnValue(false);
    const response = await replayPost(
      new NextRequest("http://localhost/replay", {
        method: "POST",
        headers: { "x-tenant-id": TENANT_ID },
      }),
      context,
    );
    expect(response.status).toBe(404);
    expect(replayExecute).not.toHaveBeenCalled();
  });

  it("invokes replay UC once on success", async () => {
    const response = await replayPost(
      new NextRequest("http://localhost/replay", {
        method: "POST",
        headers: { "x-tenant-id": TENANT_ID },
      }),
      context,
    );
    expect(response.status).toBe(200);
    expect(replayExecute).toHaveBeenCalledTimes(1);
    expect(replayExecute.mock.calls[0]![0]).toEqual({
      tenantId: TENANT_ID,
      connectionId: CONNECTION_ID,
      inboxItemId: INBOX_ID,
    });
  });

  it("rejects unknown body properties", async () => {
    const response = await replayPost(
      new NextRequest("http://localhost/replay", {
        method: "POST",
        headers: {
          "x-tenant-id": TENANT_ID,
          "content-type": "application/json",
        },
        body: JSON.stringify({ mutate: true }),
      }),
      context,
    );
    expect(response.status).toBe(400);
    expect(replayExecute).not.toHaveBeenCalled();
  });

  it("maps validation failures from UC", async () => {
    replayExecute.mockResolvedValue(
      Result.fail(new ValidationError("Source inbox item is not replayable from status: pending")),
    );
    const response = await replayPost(
      new NextRequest("http://localhost/replay", {
        method: "POST",
        headers: { "x-tenant-id": TENANT_ID },
      }),
      context,
    );
    expect(response.status).toBe(400);
  });
});
