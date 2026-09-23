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
  getTenantDashboardOverviewUseCase: {
    execute: (...args: unknown[]) => execute(...args),
  },
}));

describe("GET /api/admin/v1/dashboard/overview", () => {
  const actor = {
    userId: "user-1",
    tenantId: "tenant-a",
    role: "admin",
    platformRole: "user",
    propertyIds: null,
  };

  beforeEach(() => {
    requireTenantContext.mockReset();
    toPermissionActor.mockClear();
    execute.mockReset();
    requireTenantContext.mockResolvedValue(actor);
  });

  it("requires tenant context and returns overview for that tenant", async () => {
    const overview = {
      propertyCount: 1,
      unitCount: 2,
      bookingCount: 3,
      arrivalsNext7Days: 0,
      departuresNext7Days: 0,
      activeHoldCount: 1,
      revenue: { total: "100.0000", currency: "EUR" },
      occupancyPct: 10,
      recentBookings: [],
    };
    execute.mockResolvedValue(Result.ok(overview));

    const { GET } = await import("@/app/api/admin/v1/dashboard/overview/route");
    const request = new NextRequest("http://localhost/api/admin/v1/dashboard/overview", {
      headers: { "x-tenant-id": "tenant-a" },
    });
    const response = await GET(request);
    const body = await response.json();

    expect(requireTenantContext).toHaveBeenCalledWith("tenant-a");
    expect(execute).toHaveBeenCalledWith("tenant-a", actor);
    expect(response.status).toBe(200);
    expect(body).toEqual(overview);
    expect(body.recentBookings).toEqual([]);
    expect(body.activeHoldCount).toBe(1);
    expect(body.revenue.total).toBe("100.0000");
  });

  it("rejects missing/unauthorized tenant context", async () => {
    requireTenantContext.mockRejectedValue(new UnauthorizedError());
    const { GET } = await import("@/app/api/admin/v1/dashboard/overview/route");
    const request = new NextRequest("http://localhost/api/admin/v1/dashboard/overview");
    const response = await GET(request);
    expect(response.status).toBeGreaterThanOrEqual(401);
    expect(execute).not.toHaveBeenCalled();
  });

  it("maps forbidden use-case result", async () => {
    execute.mockResolvedValue(Result.fail(new ForbiddenError()));
    const { GET } = await import("@/app/api/admin/v1/dashboard/overview/route");
    const request = new NextRequest("http://localhost/api/admin/v1/dashboard/overview", {
      headers: { "x-tenant-id": "tenant-a" },
    });
    const response = await GET(request);
    expect(response.status).toBe(403);
  });

  it("passes header tenant id into requireTenantContext (isolation boundary)", async () => {
    execute.mockResolvedValue(Result.ok({ propertyCount: 0 }));
    const { GET } = await import("@/app/api/admin/v1/dashboard/overview/route");
    const request = new NextRequest("http://localhost/api/admin/v1/dashboard/overview", {
      headers: { "x-tenant-id": "other-tenant" },
    });
    await GET(request);
    expect(requireTenantContext).toHaveBeenCalledWith("other-tenant");
    // Actor.tenantId from DB context is what the use case receives — never the raw header alone
    expect(execute).toHaveBeenCalledWith(actor.tenantId, actor);
  });
});
