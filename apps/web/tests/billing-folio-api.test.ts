import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/tenant-context", () => ({
  requireTenantContext: vi.fn(),
  toPermissionActor: vi.fn((actor: unknown) => actor),
}));

vi.mock("@/lib/di/container", () => ({
  listFoliosForBookingUseCase: { execute: vi.fn() },
  openPrimaryFolioFromBookingUseCase: { execute: vi.fn() },
  getFolioUseCase: { execute: vi.fn() },
}));

import { requireTenantContext } from "@/lib/tenant-context";
import {
  listFoliosForBookingUseCase,
  openPrimaryFolioFromBookingUseCase,
  getFolioUseCase,
} from "@/lib/di/container";
import { GET as listGet, POST as openPost } from "@/app/api/admin/v1/bookings/[bookingId]/folios/route";
import { GET as getFolio } from "@/app/api/admin/v1/folios/[folioId]/route";
import { Result } from "@hcp/domain";

describe("admin folio routes (F1)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireTenantContext).mockResolvedValue({
      tenantId: "tenant-1",
      userId: "user-1",
      role: "admin",
      propertyIds: null,
      isSuperAdmin: false,
    } as never);
  });

  it("POST opens primary folio", async () => {
    vi.mocked(openPrimaryFolioFromBookingUseCase.execute).mockResolvedValue(
      Result.ok({
        id: "f1",
        folioKey: "primary",
        balance: { paidAmount: "0.0000", paidAmountSource: "no_allocations" },
      }) as never,
    );

    const req = new NextRequest("http://localhost/api/admin/v1/bookings/b1/folios", {
      method: "POST",
      headers: { "x-tenant-id": "tenant-1" },
    });
    const res = await openPost(req, {
      params: Promise.resolve({ bookingId: "b1" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.folioKey).toBe("primary");
    expect(openPrimaryFolioFromBookingUseCase.execute).toHaveBeenCalledWith(
      "tenant-1",
      "b1",
      expect.anything(),
    );
  });

  it("GET lists folios for booking", async () => {
    vi.mocked(listFoliosForBookingUseCase.execute).mockResolvedValue(
      Result.ok([{ id: "f1", folioKey: "primary" }]) as never,
    );
    const req = new NextRequest("http://localhost/api/admin/v1/bookings/b1/folios", {
      headers: { "x-tenant-id": "tenant-1" },
    });
    const res = await listGet(req, {
      params: Promise.resolve({ bookingId: "b1" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.folios).toHaveLength(1);
  });

  it("GET folio by id", async () => {
    vi.mocked(getFolioUseCase.execute).mockResolvedValue(
      Result.ok({ id: "f1", folioKey: "primary" }) as never,
    );
    const req = new NextRequest("http://localhost/api/admin/v1/folios/f1", {
      headers: { "x-tenant-id": "tenant-1" },
    });
    const res = await getFolio(req, {
      params: Promise.resolve({ folioId: "f1" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe("f1");
  });
});
