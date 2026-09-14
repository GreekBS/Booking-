import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import {
  ForbiddenError,
  NotFoundError,
  Result,
  UnauthorizedError,
  ValidationError,
} from "@hcp/domain";

const requireTenantContext = vi.fn();
const getClientIp = vi.fn(() => "127.0.0.1");
const toPermissionActor = vi.fn((actor: unknown) => actor);
const isChannelOperatorApiEnabled = vi.fn(() => true);

const listExecute = vi.fn();
const createExecute = vi.fn();
const getExecute = vi.fn();
const updateExecute = vi.fn();
const putCredsExecute = vi.fn();
const putWebhookExecute = vi.fn();
const activateExecute = vi.fn();
const pauseExecute = vi.fn();
const resumeExecute = vi.fn();
const disconnectExecute = vi.fn();

vi.mock("@/lib/tenant-context", () => ({
  requireTenantContext: (...args: unknown[]) => requireTenantContext(...args),
  getClientIp: (...args: unknown[]) => getClientIp(...args),
  toPermissionActor: (...args: unknown[]) => toPermissionActor(...args),
}));

vi.mock("@/lib/channels/operator-api", () => ({
  isChannelOperatorApiEnabled: (...args: unknown[]) =>
    isChannelOperatorApiEnabled(...args),
}));

vi.mock("@/lib/di/container", () => ({
  listChannelConnectionsUseCase: {
    execute: (...args: unknown[]) => listExecute(...args),
  },
  createChannelConnectionUseCase: {
    execute: (...args: unknown[]) => createExecute(...args),
  },
  getChannelConnectionUseCase: {
    execute: (...args: unknown[]) => getExecute(...args),
  },
  updateChannelConnectionMetadataUseCase: {
    execute: (...args: unknown[]) => updateExecute(...args),
  },
  putChannelConnectionCredentialsUseCase: {
    execute: (...args: unknown[]) => putCredsExecute(...args),
  },
  putChannelConnectionWebhookVerificationUseCase: {
    execute: (...args: unknown[]) => putWebhookExecute(...args),
  },
  activateChannelConnectionUseCase: {
    execute: (...args: unknown[]) => activateExecute(...args),
  },
  pauseChannelConnectionUseCase: {
    execute: (...args: unknown[]) => pauseExecute(...args),
  },
  resumeChannelConnectionUseCase: {
    execute: (...args: unknown[]) => resumeExecute(...args),
  },
  disconnectChannelConnectionUseCase: {
    execute: (...args: unknown[]) => disconnectExecute(...args),
  },
}));

import { GET as listGet, POST as listPost } from "@/app/api/admin/v1/channel-connections/route";
import {
  GET as getOne,
  PATCH as patchOne,
} from "@/app/api/admin/v1/channel-connections/[connectionId]/route";
import { PUT as putCredentials } from "@/app/api/admin/v1/channel-connections/[connectionId]/credentials/route";
import { PUT as putWebhook } from "@/app/api/admin/v1/channel-connections/[connectionId]/webhook-verification/route";
import { POST as activate } from "@/app/api/admin/v1/channel-connections/[connectionId]/activate/route";
import { POST as pause } from "@/app/api/admin/v1/channel-connections/[connectionId]/pause/route";

const TENANT_ID = "550e8400-e29b-41d4-a716-446655440900";
const CONNECTION_ID = "550e8400-e29b-41d4-a716-446655440901";
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

const context = { params: Promise.resolve({ connectionId: CONNECTION_ID }) };

const readModel = {
  connectionId: CONNECTION_ID,
  tenantId: TENANT_ID,
  provider: "manual",
  displayName: "Main",
  status: "draft",
  semanticMode: "mixed_or_unknown_feed",
  semanticConfigVersion: 1,
  hasCredentialRef: false,
  hasWebhookVerificationRef: false,
  lastError: null,
  createdAt: new Date("2026-07-01T00:00:00.000Z"),
  updatedAt: new Date("2026-07-01T00:00:00.000Z"),
};

function jsonRequest(
  method: string,
  path: string,
  body?: unknown,
  headers: Record<string, string> = {},
): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      "x-tenant-id": TENANT_ID,
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("channel-connections operator HTTP (CM-4b S4a-1)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireTenantContext.mockResolvedValue(actor);
    isChannelOperatorApiEnabled.mockReturnValue(true);
    getClientIp.mockReturnValue("127.0.0.1");
    toPermissionActor.mockImplementation((value) => value);
  });

  describe("feature gate", () => {
    it("returns 401 when unauthenticated before flag evaluation", async () => {
      requireTenantContext.mockRejectedValue(new UnauthorizedError());
      const response = await listGet(
        jsonRequest("GET", "/api/admin/v1/channel-connections"),
      );
      expect(response.status).toBe(401);
      expect(listExecute).not.toHaveBeenCalled();
    });

    it("returns 404 when flag is off for authenticated callers", async () => {
      isChannelOperatorApiEnabled.mockReturnValue(false);
      const response = await listGet(
        jsonRequest("GET", "/api/admin/v1/channel-connections"),
      );
      expect(response.status).toBe(404);
      expect(listExecute).not.toHaveBeenCalled();
    });
  });

  it("lists connections", async () => {
    listExecute.mockResolvedValue(Result.ok([readModel]));
    const response = await listGet(
      jsonRequest("GET", "/api/admin/v1/channel-connections"),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.connections[0].createdAt).toBe("2026-07-01T00:00:00.000Z");
    expect(body.connections[0].hasCredentialRef).toBe(false);
  });

  it("creates connection", async () => {
    createExecute.mockResolvedValue(Result.ok(readModel));
    const response = await listPost(
      jsonRequest("POST", "/api/admin/v1/channel-connections", {
        provider: "manual",
        displayName: "Main",
      }),
    );
    expect(response.status).toBe(201);
    expect(createExecute).toHaveBeenCalledOnce();
  });

  it("rejects unknown create keys including tenantId", async () => {
    const response = await listPost(
      jsonRequest("POST", "/api/admin/v1/channel-connections", {
        provider: "manual",
        displayName: "Main",
        tenantId: TENANT_ID,
      }),
    );
    expect(response.status).toBe(400);
    expect(createExecute).not.toHaveBeenCalled();
  });

  it("gets and patches connection", async () => {
    getExecute.mockResolvedValue(Result.ok(readModel));
    updateExecute.mockResolvedValue(
      Result.ok({ ...readModel, displayName: "Renamed" }),
    );

    const getResponse = await getOne(
      jsonRequest("GET", `/api/admin/v1/channel-connections/${CONNECTION_ID}`),
      context,
    );
    expect(getResponse.status).toBe(200);

    const patchResponse = await patchOne(
      jsonRequest("PATCH", `/api/admin/v1/channel-connections/${CONNECTION_ID}`, {
        displayName: "Renamed",
      }),
      context,
    );
    expect(patchResponse.status).toBe(200);
  });

  it("puts credentials without echoing secrets", async () => {
    putCredsExecute.mockResolvedValue(
      Result.ok({ ...readModel, status: "pending_auth", hasCredentialRef: true }),
    );
    const secret = "super-secret-token-value";
    const response = await putCredentials(
      jsonRequest("PUT", `/api/admin/v1/channel-connections/${CONNECTION_ID}/credentials`, {
        material: { apiKey: secret },
      }),
      context,
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(JSON.stringify(body)).not.toContain(secret);
    expect(body.hasCredentialRef).toBe(true);
  });

  it("puts webhook verification without echoing secret", async () => {
    putWebhookExecute.mockResolvedValue(
      Result.ok({ ...readModel, hasWebhookVerificationRef: true }),
    );
    const secret = "whsec_live_abc";
    const response = await putWebhook(
      jsonRequest(
        "PUT",
        `/api/admin/v1/channel-connections/${CONNECTION_ID}/webhook-verification`,
        { secret },
      ),
      context,
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(JSON.stringify(body)).not.toContain(secret);
  });

  it("runs lifecycle activate and pause", async () => {
    activateExecute.mockResolvedValue(
      Result.ok({
        connectionId: CONNECTION_ID,
        status: "active",
        semanticMode: "mixed_or_unknown_feed",
        semanticConfigVersion: 1,
      }),
    );
    pauseExecute.mockResolvedValue(
      Result.ok({
        connectionId: CONNECTION_ID,
        status: "paused",
        semanticMode: "mixed_or_unknown_feed",
        semanticConfigVersion: 1,
      }),
    );

    const activateResponse = await activate(
      jsonRequest("POST", `/api/admin/v1/channel-connections/${CONNECTION_ID}/activate`, {
        expectedSemanticConfigVersion: 1,
      }),
      context,
    );
    expect(activateResponse.status).toBe(200);

    const pauseResponse = await pause(
      jsonRequest("POST", `/api/admin/v1/channel-connections/${CONNECTION_ID}/pause`, {
        expectedSemanticConfigVersion: 1,
      }),
      context,
    );
    expect(pauseResponse.status).toBe(200);
  });

  it("maps use-case failures", async () => {
    getExecute.mockResolvedValue(Result.fail(new NotFoundError("ChannelConnection", "x")));
    expect(
      (
        await getOne(
          jsonRequest("GET", `/api/admin/v1/channel-connections/${CONNECTION_ID}`),
          context,
        )
      ).status,
    ).toBe(404);

    updateExecute.mockResolvedValue(Result.fail(new ForbiddenError()));
    expect(
      (
        await patchOne(
          jsonRequest("PATCH", `/api/admin/v1/channel-connections/${CONNECTION_ID}`, {
            displayName: "X",
          }),
          context,
        )
      ).status,
    ).toBe(403);

    createExecute.mockResolvedValue(Result.fail(new ValidationError("bad")));
    expect(
      (
        await listPost(
          jsonRequest("POST", "/api/admin/v1/channel-connections", {
            provider: "manual",
            displayName: "X",
          }),
        )
      ).status,
    ).toBe(400);
  });
});
