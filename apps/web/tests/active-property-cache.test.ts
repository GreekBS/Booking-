import { describe, it, expect, vi, beforeEach } from "vitest";

describe("active property client cache keys", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("keys overview inflight by tenantId + propertyId", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        propertyCount: 1,
        unitCount: 0,
        bookingCount: 0,
        arrivalsNext7Days: 0,
        departuresNext7Days: 0,
        activeHoldCount: 0,
        revenue: null,
        occupancyPct: 0,
        recentBookings: [],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { fetchDashboardOverview } = await import("@/lib/admin/api");

    await Promise.all([
      fetchDashboardOverview("t1", "p1"),
      fetchDashboardOverview("t1", "p1"),
      fetchDashboardOverview("t1", "p2"),
    ]);

    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(urls.filter((u) => u.includes("propertyId=p1")).length).toBe(1);
    expect(urls.filter((u) => u.includes("propertyId=p2")).length).toBe(1);
  });
});
