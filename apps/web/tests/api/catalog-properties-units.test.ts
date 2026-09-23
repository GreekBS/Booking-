import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { ForbiddenError, Result, UnauthorizedError } from "@hcp/domain";

const requireTenantContext = vi.fn();
const toPermissionActor = vi.fn((actor: unknown) => actor);
const execute = vi.fn();

vi.mock("@/lib/tenant-context", () => ({
  requireTenantContext: (...args: unknown[]) => requireTenantContext(...args),
  toPermissionActor: (...args: unknown[]) => toPermissionActor(...args),
}));

vi.mock("@/lib/di/container", () => ({
  listPropertyUnitCatalogUseCase: {
    execute: (...args: unknown[]) => execute(...args),
  },
}));

describe("GET /api/admin/v1/catalog/properties-units", () => {
  const actor = {
    userId: "user-1",
    tenantId: "tenant-a",
    role: "admin",
    platformRole: "user",
    propertyIds: null,
  };

  const slimCatalog = {
    properties: [
      {
        id: "prop-1",
        name: "Villa",
        status: "active",
        units: [
          {
            id: "unit-1",
            propertyId: "prop-1",
            name: "Main",
            status: "active",
          },
        ],
      },
    ],
  };

  beforeEach(() => {
    requireTenantContext.mockReset();
    toPermissionActor.mockClear();
    execute.mockReset();
    requireTenantContext.mockResolvedValue(actor);
  });

  it("requires tenant context and returns slim catalog only", async () => {
    execute.mockResolvedValue(Result.ok(slimCatalog));

    const { GET } = await import(
      "@/app/api/admin/v1/catalog/properties-units/route"
    );
    const request = new NextRequest(
      "http://localhost/api/admin/v1/catalog/properties-units",
      { headers: { "x-tenant-id": "tenant-a" } },
    );
    const response = await GET(request);
    const body = await response.json();

    expect(requireTenantContext).toHaveBeenCalledWith("tenant-a");
    expect(execute).toHaveBeenCalledWith("tenant-a", actor);
    expect(response.status).toBe(200);
    expect(body).toEqual(slimCatalog);

    const prop = body.properties[0];
    expect(Object.keys(prop).sort()).toEqual(
      ["id", "name", "status", "units"].sort(),
    );
    expect(Object.keys(prop.units[0]).sort()).toEqual(
      ["id", "name", "propertyId", "status"].sort(),
    );
    expect(JSON.stringify(body)).not.toMatch(/amenit/i);
  });

  it("rejects unauthorized tenant context", async () => {
    requireTenantContext.mockRejectedValue(new UnauthorizedError());
    const { GET } = await import(
      "@/app/api/admin/v1/catalog/properties-units/route"
    );
    const request = new NextRequest(
      "http://localhost/api/admin/v1/catalog/properties-units",
    );
    const response = await GET(request);
    expect(response.status).toBeGreaterThanOrEqual(401);
    expect(execute).not.toHaveBeenCalled();
  });

  it("maps forbidden use-case result", async () => {
    execute.mockResolvedValue(Result.fail(new ForbiddenError()));
    const { GET } = await import(
      "@/app/api/admin/v1/catalog/properties-units/route"
    );
    const request = new NextRequest(
      "http://localhost/api/admin/v1/catalog/properties-units",
      { headers: { "x-tenant-id": "tenant-a" } },
    );
    const response = await GET(request);
    expect(response.status).toBe(403);
  });
});
