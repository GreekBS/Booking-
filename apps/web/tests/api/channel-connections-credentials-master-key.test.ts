import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import {
  PersistenceCorruptionError,
  Result,
  UnauthorizedError,
} from "@hcp/domain";

const requireTenantContext = vi.fn();
const getClientIp = vi.fn(() => "127.0.0.1");
const toPermissionActor = vi.fn((actor: unknown) => actor);
const isChannelOperatorApiEnabled = vi.fn(() => true);
const putCredsExecute = vi.fn();

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
  putChannelConnectionCredentialsUseCase: {
    execute: (...args: unknown[]) => putCredsExecute(...args),
  },
}));

import { PUT as putCredentials } from "@/app/api/admin/v1/channel-connections/[connectionId]/credentials/route";

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

describe("credentials route master-key misconfiguration (CM-4b S4a-1 corrective)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireTenantContext.mockResolvedValue(actor);
    isChannelOperatorApiEnabled.mockReturnValue(true);
    toPermissionActor.mockImplementation((value) => value);
  });

  it("maps missing master key to 500 configuration failure, not 400", async () => {
    putCredsExecute.mockResolvedValue(
      Result.fail(
        new PersistenceCorruptionError("Channel credentials encryption is not configured"),
      ),
    );

    const response = await putCredentials(
      new NextRequest(
        `http://localhost/api/admin/v1/channel-connections/${CONNECTION_ID}/credentials`,
        {
          method: "PUT",
          headers: {
            "content-type": "application/json",
            "x-tenant-id": TENANT_ID,
          },
          body: JSON.stringify({ material: { apiKey: "client-secret" } }),
        },
      ),
      context,
    );

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error.code).toBe("PERSISTENCE_CORRUPTION");
    expect(JSON.stringify(body)).not.toContain("client-secret");
    expect(JSON.stringify(body)).not.toContain("CHANNELS_CREDENTIALS");
  });

  it("does not invoke use case when operator flag is off", async () => {
    isChannelOperatorApiEnabled.mockReturnValue(false);
    const response = await putCredentials(
      new NextRequest(
        `http://localhost/api/admin/v1/channel-connections/${CONNECTION_ID}/credentials`,
        {
          method: "PUT",
          headers: {
            "content-type": "application/json",
            "x-tenant-id": TENANT_ID,
          },
          body: JSON.stringify({ material: { apiKey: "x" } }),
        },
      ),
      context,
    );
    expect(response.status).toBe(404);
    expect(putCredsExecute).not.toHaveBeenCalled();
  });

  it("does not invoke use case when unauthenticated", async () => {
    requireTenantContext.mockRejectedValue(new UnauthorizedError());
    const response = await putCredentials(
      new NextRequest(
        `http://localhost/api/admin/v1/channel-connections/${CONNECTION_ID}/credentials`,
        {
          method: "PUT",
          headers: {
            "content-type": "application/json",
            "x-tenant-id": TENANT_ID,
          },
          body: JSON.stringify({ material: { apiKey: "x" } }),
        },
      ),
      context,
    );
    expect(response.status).toBe(401);
    expect(putCredsExecute).not.toHaveBeenCalled();
  });
});
