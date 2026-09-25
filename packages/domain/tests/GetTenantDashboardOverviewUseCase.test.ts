import { describe, it, expect, vi, beforeEach } from "vitest";
import { GetTenantDashboardOverviewUseCase } from "../src/commerce/application/GetTenantDashboardOverviewUseCase";
import type {
  ITenantDashboardOverviewQuery,
  TenantDashboardOverviewReadModel,
} from "../src/commerce/ports/ITenantDashboardOverviewQuery";
import { PermissionChecker } from "../src/shared/services/PermissionChecker";
import { ForbiddenError } from "../src/shared/errors/DomainError";

function emptyOverview(
  overrides: Partial<TenantDashboardOverviewReadModel> = {},
): TenantDashboardOverviewReadModel {
  return {
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
    recentBookings: [],
    todayArrivals: [],
    todayDepartures: [],
    ...overrides,
  };
}

describe("GetTenantDashboardOverviewUseCase", () => {
  const permissionChecker = new PermissionChecker();
  const getOverview = vi.fn();

  const overviewQuery: ITenantDashboardOverviewQuery = {
    getOverview,
  };

  const useCase = new GetTenantDashboardOverviewUseCase(
    overviewQuery,
    permissionChecker,
  );

  beforeEach(() => {
    getOverview.mockReset();
    getOverview.mockResolvedValue(emptyOverview());
  });

  it("returns overview for admin with tenant-wide booking read (null property scope)", async () => {
    const overview = emptyOverview({
      propertyCount: 2,
      unitCount: 5,
      bookingCount: 10,
      activeHoldCount: 3,
      revenue: { total: "1500.0000", currency: "EUR" },
      recentBookings: [
        {
          id: "b1",
          guestName: "Ada",
          checkIn: "2026-09-20",
          checkOut: "2026-09-22",
          status: "confirmed",
          totalAmount: "200.0000",
          currency: "EUR",
          unitName: "Suite A",
        },
      ],
    });
    getOverview.mockResolvedValue(overview);

    const result = await useCase.execute("tenant-a", {
      userId: "admin-1",
      role: "admin",
      propertyIds: null,
      isSuperAdmin: false,
    });

    expect(result.isSuccess).toBe(true);
    expect(result.getValue()).toEqual(overview);
    expect(getOverview).toHaveBeenCalledTimes(1);
    expect(getOverview).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant-a",
        allowedPropertyIds: null,
        recentLimit: 8,
      }),
    );
  });

  it("scopes manager to assigned property ids via booking:read:assigned", async () => {
    const result = await useCase.execute("tenant-a", {
      userId: "manager-1",
      role: "manager",
      propertyIds: ["prop-a", "prop-b"],
      isSuperAdmin: false,
    });

    expect(result.isSuccess).toBe(true);
    expect(getOverview).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant-a",
        allowedPropertyIds: ["prop-a", "prop-b"],
        recentLimit: 8,
      }),
    );
  });

  it("scopes manager with empty assignments to empty property allow-list", async () => {
    const result = await useCase.execute("tenant-a", {
      userId: "manager-1",
      role: "manager",
      propertyIds: [],
      isSuperAdmin: false,
    });

    expect(result.isSuccess).toBe(true);
    expect(getOverview).toHaveBeenCalledWith(
      expect.objectContaining({ allowedPropertyIds: [] }),
    );
  });

  it("forbids when role has no relevant permissions", async () => {
    const result = await useCase.execute("tenant-a", {
      userId: "nobody",
      role: "viewer" as "admin",
      propertyIds: null,
      isSuperAdmin: false,
    });

    expect(result.isFailure).toBe(true);
    expect(result.getError()).toBeInstanceOf(ForbiddenError);
    expect(getOverview).not.toHaveBeenCalled();
  });

  it("passes recentLimit of 8 — never unbounded booking lists", async () => {
    await useCase.execute("tenant-a", {
      userId: "admin-1",
      role: "admin",
      propertyIds: null,
    });

    const arg = getOverview.mock.calls[0]![0];
    expect(arg.recentLimit).toBe(8);
    expect(arg.recentLimit).toBeLessThan(50);
  });

  it("preserves revenue from query (authoritative booking totals, not quotes)", async () => {
    getOverview.mockResolvedValue(
      emptyOverview({
        revenue: { total: "999.5000", currency: "EUR" },
        activeHoldCount: 4,
        bookingCount: 12,
      }),
    );

    const result = await useCase.execute("tenant-a", {
      userId: "admin-1",
      role: "admin",
      propertyIds: null,
    });

    const value = result.getValue();
    expect(value.revenue).toEqual({ total: "999.5000", currency: "EUR" });
    expect(value.activeHoldCount).toBe(4);
    expect(value.bookingCount).toBe(12);
  });

  it("narrows allowedPropertyIds when propertyId is provided and authorized", async () => {
    const result = await useCase.execute(
      "tenant-a",
      {
        userId: "admin-1",
        role: "admin",
        propertyIds: null,
        isSuperAdmin: false,
      },
      { propertyId: "prop-x" },
    );

    expect(result.isSuccess).toBe(true);
    expect(getOverview).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant-a",
        allowedPropertyIds: ["prop-x"],
      }),
    );
  });

  it("rejects propertyId outside manager assignment", async () => {
    const result = await useCase.execute(
      "tenant-a",
      {
        userId: "mgr-1",
        role: "manager",
        propertyIds: ["prop-a"],
        isSuperAdmin: false,
      },
      { propertyId: "prop-forged" },
    );

    expect(result.isFailure).toBe(true);
    expect(result.getError()).toBeInstanceOf(ForbiddenError);
    expect(getOverview).not.toHaveBeenCalled();
  });
});
