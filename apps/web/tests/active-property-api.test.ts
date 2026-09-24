import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/tenant-context", () => ({
  requireTenantContext: vi.fn(),
  toPermissionActor: vi.fn((actor: unknown) => actor),
}));

vi.mock("@/lib/di/container", () => ({
  getTenantDashboardOverviewUseCase: { execute: vi.fn() },
  listPaymentsUseCase: { execute: vi.fn() },
}));

import { requireTenantContext } from "@/lib/tenant-context";
import {
  getTenantDashboardOverviewUseCase,
  listPaymentsUseCase,
} from "@/lib/di/container";
import { GET as overviewGet } from "@/app/api/admin/v1/dashboard/overview/route";
import { GET as paymentsGet } from "@/app/api/admin/v1/payments/route";
import { Result, ForbiddenError } from "@hcp/domain";

describe("Active property API filtering", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireTenantContext).mockResolvedValue({
      tenantId: "tenant-1",
      userId: "user-1",
      email: "a@b.c",
      platformRole: null,
      role: "admin",
      propertyIds: null,
      isSuperAdmin: false,
      activeTenantId: "tenant-1",
    });
  });

  it("passes propertyId to dashboard overview use case", async () => {
    vi.mocked(getTenantDashboardOverviewUseCase.execute).mockResolvedValue(
      Result.ok({
        propertyCount: 1,
        unitCount: 2,
        bookingCount: 0,
        arrivalsNext7Days: 0,
        departuresNext7Days: 0,
        activeHoldCount: 0,
        revenue: null,
        occupancyPct: 0,
        recentBookings: [],
      }),
    );

    const req = new NextRequest(
      "http://localhost/api/admin/v1/dashboard/overview?propertyId=prop-1",
      { headers: { "x-tenant-id": "tenant-1" } },
    );
    const res = await overviewGet(req);
    expect(res.status).toBe(200);
    expect(getTenantDashboardOverviewUseCase.execute).toHaveBeenCalledWith(
      "tenant-1",
      expect.anything(),
      { propertyId: "prop-1" },
    );
  });

  it("passes propertyId to payments list use case", async () => {
    vi.mocked(listPaymentsUseCase.execute).mockResolvedValue(Result.ok([]));

    const req = new NextRequest(
      "http://localhost/api/admin/v1/payments?propertyId=prop-1",
      { headers: { "x-tenant-id": "tenant-1" } },
    );
    const res = await paymentsGet(req);
    expect(res.status).toBe(200);
    expect(listPaymentsUseCase.execute).toHaveBeenCalledWith(
      "tenant-1",
      expect.anything(),
      expect.objectContaining({ propertyId: "prop-1" }),
    );
  });

  it("maps forbidden property access from overview", async () => {
    vi.mocked(getTenantDashboardOverviewUseCase.execute).mockResolvedValue(
      Result.fail(new ForbiddenError("Property access denied")),
    );

    const req = new NextRequest(
      "http://localhost/api/admin/v1/dashboard/overview?propertyId=forged",
      { headers: { "x-tenant-id": "tenant-1" } },
    );
    const res = await overviewGet(req);
    expect(res.status).toBe(403);
  });
});
