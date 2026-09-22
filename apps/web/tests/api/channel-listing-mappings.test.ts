import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { ForbiddenError, NotFoundError, Result, UnauthorizedError } from "@hcp/domain";

const requireTenantContext = vi.fn();
const getClientIp = vi.fn(() => "127.0.0.1");
const toPermissionActor = vi.fn((actor: unknown) => actor);
const isChannelOperatorApiEnabled = vi.fn(() => true);
const getConnectionExecute = vi.fn();
const upsertExecute = vi.fn();
const listByConnection = vi.fn();

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
  getChannelConnectionUseCase: {
    execute: (...args: unknown[]) => getConnectionExecute(...args),
  },
  upsertChannelListingMappingUseCase: {
    execute: (...args: unknown[]) => upsertExecute(...args),
  },
  channelListingMappingRepository: {
    listByConnection: (...args: unknown[]) => listByConnection(...args),
  },
}));

import {
  GET,
  PUT,
} from "@/app/api/admin/v1/channel-connections/[connectionId]/mappings/route";

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

function ctx() {
  return { params: Promise.resolve({ connectionId: CONNECTION_ID }) };
}

describe("channel listing mappings HTTP", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isChannelOperatorApiEnabled.mockReturnValue(true);
    requireTenantContext.mockResolvedValue(actor);
  });

  it("GET refuses when operator API disabled", async () => {
    isChannelOperatorApiEnabled.mockReturnValue(false);
    const res = await GET(
      new NextRequest(
        `http://localhost/api/admin/v1/channel-connections/${CONNECTION_ID}/mappings`,
        { headers: { "x-tenant-id": TENANT_ID } },
      ),
      ctx(),
    );
    expect(res.status).toBe(404);
    expect(listByConnection).not.toHaveBeenCalled();
  });

  it("GET refuses unauthorized tenant context", async () => {
    requireTenantContext.mockRejectedValue(new UnauthorizedError());
    const res = await GET(
      new NextRequest(
        `http://localhost/api/admin/v1/channel-connections/${CONNECTION_ID}/mappings`,
      ),
      ctx(),
    );
    expect(res.status).toBe(401);
    expect(listByConnection).not.toHaveBeenCalled();
  });

  it("GET refuses when connection not visible to tenant", async () => {
    getConnectionExecute.mockResolvedValue(
      Result.fail(new NotFoundError("ChannelConnection", CONNECTION_ID)),
    );
    const res = await GET(
      new NextRequest(
        `http://localhost/api/admin/v1/channel-connections/${CONNECTION_ID}/mappings`,
        { headers: { "x-tenant-id": TENANT_ID } },
      ),
      ctx(),
    );
    expect(res.status).toBe(404);
    expect(listByConnection).not.toHaveBeenCalled();
  });

  it("GET returns operator-safe mapping rows (no credential fields)", async () => {
    getConnectionExecute.mockResolvedValue(
      Result.ok({
        connectionId: CONNECTION_ID,
        tenantId: TENANT_ID,
      }),
    );
    const createdAt = new Date("2026-01-02T00:00:00.000Z");
    listByConnection.mockResolvedValue([
      {
        id: "m1",
        connectionId: CONNECTION_ID,
        externalListingId: "listing-1",
        externalUnitId: null,
        propertyId: "p1",
        unitId: "u1",
        syncDirection: "inbound",
        status: "active",
        mappingVersion: 1,
        lastError: null,
        createdAt,
        updatedAt: createdAt,
      },
    ]);

    const res = await GET(
      new NextRequest(
        `http://localhost/api/admin/v1/channel-connections/${CONNECTION_ID}/mappings`,
        { headers: { "x-tenant-id": TENANT_ID } },
      ),
      ctx(),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      mappings: Array<Record<string, unknown>>;
    };
    expect(body.mappings).toHaveLength(1);
    expect(body.mappings[0]).toMatchObject({
      mappingId: "m1",
      propertyId: "p1",
      unitId: "u1",
      status: "active",
    });
    expect(JSON.stringify(body)).not.toMatch(/feedUrl|credential|material/i);
  });

  it("PUT refuses forbidden actors via use case", async () => {
    upsertExecute.mockResolvedValue(Result.fail(new ForbiddenError()));
    const res = await PUT(
      new NextRequest(
        `http://localhost/api/admin/v1/channel-connections/${CONNECTION_ID}/mappings`,
        {
          method: "PUT",
          headers: {
            "content-type": "application/json",
            "x-tenant-id": TENANT_ID,
          },
          body: JSON.stringify({
            externalListingId: "ext",
            propertyId: "p1",
            unitId: "u1",
            expectedSemanticConfigVersion: 1,
          }),
        },
      ),
      ctx(),
    );
    expect(res.status).toBe(403);
  });
});
