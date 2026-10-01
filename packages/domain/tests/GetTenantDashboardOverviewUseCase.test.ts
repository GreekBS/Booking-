import { describe, it, expect, vi, beforeEach } from "vitest";
import { GetTenantDashboardOverviewUseCase } from "../src/commerce/application/GetTenantDashboardOverviewUseCase";
import type {
  ITenantDashboardOverviewQuery,
  TenantDashboardOverviewReadModel,
} from "../src/commerce/ports/ITenantDashboardOverviewQuery";
import { PermissionChecker } from "../src/shared/services/PermissionChecker";
import { ForbiddenError } from "../src/shared/errors/DomainError";
import { buildYear } from "../src/commerce/analytics/AnalyticsPeriod";

function emptyOverview(
  overrides: Partial<TenantDashboardOverviewReadModel> = {},
): TenantDashboardOverviewReadModel {
  const period = buildYear(2026);
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
    periodAnalytics: {
      period,
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
    ...overrides,
  };
}

describe("GetTenantDashboardOverviewUseCase", () => {
  const permissionChecker = new PermissionChecker();
  const getOverview = vi.fn();
  const getProperty = vi.fn();
  const getPropertiesByIds = vi.fn();
  const propertyLocalToday = vi.fn();

  const overviewQuery: ITenantDashboardOverviewQuery = {
    getOverview,
  };

  const catalog = {
    getUnit: vi.fn(),
    getProperty,
    getUnitsByIds: vi.fn(),
    getPropertiesByIds,
    getUnitPropertyContextsByUnitIds: vi.fn(),
  };

  const timezone = {
    propertyLocalToday,
  };

  const useCase = new GetTenantDashboardOverviewUseCase(
    overviewQuery,
    permissionChecker,
    catalog as never,
    timezone as never,
  );

  beforeEach(() => {
    getOverview.mockReset();
    getProperty.mockReset();
    getPropertiesByIds.mockReset();
    propertyLocalToday.mockReset();
    getOverview.mockResolvedValue(emptyOverview());
    propertyLocalToday.mockResolvedValue("2026-10-01");
    getProperty.mockResolvedValue({
      id: "prop-x",
      tenantId: "tenant-a",
      timezone: "Europe/Athens",
      status: "active",
    });
  });

  it("returns overview for admin with tenant-wide booking read (null property scope)", async () => {
    const overview = emptyOverview({
      propertyCount: 2,
      unitCount: 5,
      bookingCount: 10,
      activeHoldCount: 3,
      revenue: { total: "1500.0000", currency: "EUR" },
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
        todayIso: "2026-10-01",
        period: expect.objectContaining({
          periodType: "year",
          year: 2026,
          startDate: "2026-01-01",
          endDateExclusive: "2027-01-01",
        }),
      }),
    );
  });

  it("defaults to Year using property-local today year", async () => {
    propertyLocalToday.mockResolvedValue("2027-02-10");
    await useCase.execute(
      "tenant-a",
      {
        userId: "admin-1",
        role: "admin",
        propertyIds: null,
        isSuperAdmin: false,
      },
      { propertyId: "prop-x" },
    );
    expect(getProperty).toHaveBeenCalledWith("prop-x", "tenant-a");
    expect(propertyLocalToday).toHaveBeenCalledWith("Europe/Athens");
    expect(getOverview).toHaveBeenCalledWith(
      expect.objectContaining({
        period: expect.objectContaining({ periodType: "year", year: 2027 }),
        todayIso: "2027-02-10",
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
