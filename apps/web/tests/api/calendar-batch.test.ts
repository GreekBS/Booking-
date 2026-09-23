import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { ForbiddenError, Result, UnauthorizedError, ValidationError } from "@hcp/domain";

const requireTenantContext = vi.fn();
const toPermissionActor = vi.fn((actor: unknown) => actor);
const calendarExecute = vi.fn();
const ratesExecute = vi.fn();
const rulesExecute = vi.fn();

vi.mock("@/lib/tenant-context", () => ({
  requireTenantContext: (...args: unknown[]) => requireTenantContext(...args),
  toPermissionActor: (...args: unknown[]) => toPermissionActor(...args),
}));

vi.mock("@/lib/di/container", () => ({
  getUnitsCalendarBatchUseCase: {
    execute: (...args: unknown[]) => calendarExecute(...args),
  },
  getUnitsRatePlansBatchUseCase: {
    execute: (...args: unknown[]) => ratesExecute(...args),
  },
  getUnitsAvailabilityRulesBatchUseCase: {
    execute: (...args: unknown[]) => rulesExecute(...args),
  },
}));

const UNIT_A = "11111111-1111-4111-8111-111111111111";
const UNIT_B = "22222222-2222-4222-8222-222222222222";

describe("Calendar batch APIs", () => {
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
    calendarExecute.mockReset();
    ratesExecute.mockReset();
    rulesExecute.mockReset();
    requireTenantContext.mockResolvedValue(actor);
  });

  it("POST /calendar/batch requires tenant and returns units map", async () => {
    calendarExecute.mockResolvedValue(
      Result.ok({
        [UNIT_A]: { blocks: [], holds: [], bookings: [] },
      }),
    );
    const { POST } = await import("@/app/api/admin/v1/calendar/batch/route");
    const request = new NextRequest("http://localhost/api/admin/v1/calendar/batch", {
      method: "POST",
      headers: { "x-tenant-id": "tenant-a", "content-type": "application/json" },
      body: JSON.stringify({
        unitIds: [UNIT_A],
        from: "2026-06-01",
        to: "2026-09-01",
      }),
    });
    const response = await POST(request);
    const body = await response.json();
    expect(requireTenantContext).toHaveBeenCalledWith("tenant-a");
    expect(calendarExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant-a",
        unitIds: [UNIT_A],
        from: "2026-06-01",
        to: "2026-09-01",
      }),
      actor,
    );
    expect(response.status).toBe(200);
    expect(body.units[UNIT_A].blocks).toEqual([]);
  });

  it("rejects unauthorized calendar batch", async () => {
    requireTenantContext.mockRejectedValue(new UnauthorizedError());
    const { POST } = await import("@/app/api/admin/v1/calendar/batch/route");
    const request = new NextRequest("http://localhost/api/admin/v1/calendar/batch", {
      method: "POST",
      body: JSON.stringify({
        unitIds: [UNIT_A],
        from: "2026-06-01",
        to: "2026-07-01",
      }),
    });
    const response = await POST(request);
    expect(response.status).toBeGreaterThanOrEqual(401);
    expect(calendarExecute).not.toHaveBeenCalled();
  });

  it("maps validation failure for mixed foreign units", async () => {
    calendarExecute.mockResolvedValue(
      Result.fail(new ValidationError("One or more units were not found")),
    );
    const { POST } = await import("@/app/api/admin/v1/calendar/batch/route");
    const request = new NextRequest("http://localhost/api/admin/v1/calendar/batch", {
      method: "POST",
      headers: { "x-tenant-id": "tenant-a", "content-type": "application/json" },
      body: JSON.stringify({
        unitIds: [UNIT_A, UNIT_B],
        from: "2026-06-01",
        to: "2026-07-01",
      }),
    });
    const response = await POST(request);
    expect(response.status).toBe(400);
  });

  it("POST /rate-plans/batch and /availability-rules/batch are tenant-gated", async () => {
    ratesExecute.mockResolvedValue(Result.ok({ [UNIT_A]: null }));
    rulesExecute.mockResolvedValue(
      Result.ok({
        [UNIT_A]: {
          minNights: 1,
          maxNights: 30,
          checkInDays: [0, 1, 2, 3, 4, 5, 6],
          checkOutDays: [0, 1, 2, 3, 4, 5, 6],
          advanceMinDays: 0,
          advanceMaxDays: 365,
          turnoverNights: 0,
        },
      }),
    );

    const rates = await import("@/app/api/admin/v1/rate-plans/batch/route");
    const rules = await import("@/app/api/admin/v1/availability-rules/batch/route");

    const rateReq = new NextRequest("http://localhost/api/admin/v1/rate-plans/batch", {
      method: "POST",
      headers: { "x-tenant-id": "tenant-a", "content-type": "application/json" },
      body: JSON.stringify({ unitIds: [UNIT_A] }),
    });
    const rulesReq = new NextRequest("http://localhost/api/admin/v1/availability-rules/batch", {
      method: "POST",
      headers: { "x-tenant-id": "tenant-a", "content-type": "application/json" },
      body: JSON.stringify({ unitIds: [UNIT_A] }),
    });

    expect((await rates.POST(rateReq)).status).toBe(200);
    expect((await rules.POST(rulesReq)).status).toBe(200);
    expect(ratesExecute).toHaveBeenCalled();
    expect(rulesExecute).toHaveBeenCalled();
  });

  it("rejects oversized unit batch via validator", async () => {
    const unitIds = Array.from({ length: 101 }, (_, i) => {
      const hex = i.toString(16).padStart(12, "0");
      return `11111111-1111-4111-8111-${hex}`;
    });

    const { POST } = await import("@/app/api/admin/v1/calendar/batch/route");
    const request = new NextRequest("http://localhost/api/admin/v1/calendar/batch", {
      method: "POST",
      headers: { "x-tenant-id": "tenant-a", "content-type": "application/json" },
      body: JSON.stringify({
        unitIds,
        from: "2026-06-01",
        to: "2026-07-01",
      }),
    });
    const response = await POST(request);
    expect(response.status).toBe(400);
    expect(calendarExecute).not.toHaveBeenCalled();
  });
});
