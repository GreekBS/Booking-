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
      arrivalsToday: 0,
      departuresToday: 0,
      inHouseToday: 0,
      activeHoldCount: 1,
      revenue: { total: "100.0000", currency: "EUR" },
      occupancyPct: 10,
      periodAnalytics: {
        period: {
          periodType: "year",
          startDate: "2026-01-01",
          endDateExclusive: "2027-01-01",
          year: 2026,
          displayLabel: "2026",
        },
        revenue: { total: "100.0000", currency: "EUR" },
        bookingCount: 3,
        occupiedNights: 5,
        occupancyPct: 10,
        adr: { amount: "20.0000", currency: "EUR" },
        capacityNights: 50,
      },
      localToday: "2026-10-01",
      propertyTimezone: "Europe/Athens",
      recentBookings: [],
      todayArrivals: [],
      todayDepartures: [],
    };
    execute.mockResolvedValue(Result.ok(overview));

    const { GET } = await import("@/app/api/admin/v1/dashboard/overview/route");
    const request = new NextRequest("http://localhost/api/admin/v1/dashboard/overview", {
      headers: { "x-tenant-id": "tenant-a" },
    });
    const response = await GET(request);
    const body = await response.json();

    expect(requireTenantContext).toHaveBeenCalledWith("tenant-a");
    expect(execute).toHaveBeenCalledWith(
      "tenant-a",
      actor,
      expect.objectContaining({
        period: expect.any(Object),
      }),
    );
    expect(response.status).toBe(200);
    expect(body).toEqual(overview);
    expect(body.recentBookings).toEqual([]);
    expect(body.activeHoldCount).toBe(1);
    expect(body.revenue.total).toBe("100.0000");
    expect(body.periodAnalytics.period.periodType).toBe("year");
  });

  it("passes period query params through to the use case", async () => {
    execute.mockResolvedValue(
      Result.ok({
        propertyCount: 0,
        unitCount: 0,
        bookingCount: 0,
        arrivalsNext7Days: 0,
        departuresNext7Days: 0,
        arrivalsToday: 0,
        departuresToday: 0,
        inHouseToday: 0,
        activeHoldCount: 0,
        revenue: null,
        occupancyPct: 0,
        periodAnalytics: {
          period: {
            periodType: "month",
            startDate: "2026-10-01",
            endDateExclusive: "2026-11-01",
            year: 2026,
            month: 10,
            displayLabel: "Οκτώβριος 2026",
          },
          revenue: null,
          bookingCount: 0,
          occupiedNights: 0,
          occupancyPct: 0,
          adr: null,
          capacityNights: 0,
        },
        localToday: "2026-10-01",
        propertyTimezone: "Europe/Athens",
        recentBookings: [],
        todayArrivals: [],
        todayDepartures: [],
      }),
    );
    const { GET } = await import("@/app/api/admin/v1/dashboard/overview/route");
    const request = new NextRequest(
      "http://localhost/api/admin/v1/dashboard/overview?period=month&year=2026&month=10&propertyId=prop-1",
      { headers: { "x-tenant-id": "tenant-a" } },
    );
    await GET(request);
    expect(execute).toHaveBeenCalledWith(
      "tenant-a",
      actor,
      expect.objectContaining({
        propertyId: "prop-1",
        period: expect.objectContaining({
          period: "month",
          year: "2026",
          month: "10",
        }),
      }),
    );
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
    expect(execute).toHaveBeenCalledWith(
      actor.tenantId,
      actor,
      expect.objectContaining({ period: expect.any(Object) }),
    );
  });
});
