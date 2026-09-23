import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/tenant-context", () => ({
  requireTenantContext: vi.fn(),
  toPermissionActor: vi.fn((actor: unknown) => actor),
}));

vi.mock("@/lib/di/container", () => ({
  listBusinessFiscalProfilesUseCase: { execute: vi.fn() },
  upsertBusinessFiscalProfileUseCase: { execute: vi.fn() },
  listCustomerBillingProfilesUseCase: { execute: vi.fn() },
  upsertCustomerBillingProfileUseCase: { execute: vi.fn() },
  evaluateAndPostFolioTaxesUseCase: { execute: vi.fn() },
}));

import { requireTenantContext } from "@/lib/tenant-context";
import {
  listBusinessFiscalProfilesUseCase,
  upsertBusinessFiscalProfileUseCase,
  evaluateAndPostFolioTaxesUseCase,
} from "@/lib/di/container";
import { GET as listBiz } from "@/app/api/admin/v1/fiscal/business-profiles/route";
import { PUT as upsertBiz } from "@/app/api/admin/v1/fiscal/business-profiles/route";
import { GET as listLocations } from "@/app/api/admin/v1/fiscal/locations/route";
import { POST as evalTaxes } from "@/app/api/admin/v1/folios/[folioId]/evaluate-taxes/route";
import { Result } from "@hcp/domain";

describe("admin fiscal / tax routes (F2 / F2.1)", () => {
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

  it("GET business fiscal profiles", async () => {
    vi.mocked(listBusinessFiscalProfilesUseCase.execute).mockResolvedValue(
      Result.ok([{ id: "b1", propertyId: "p1" }]) as never,
    );
    const req = new NextRequest(
      "http://localhost/api/admin/v1/fiscal/business-profiles",
      { headers: { "x-tenant-id": "tenant-1" } },
    );
    const res = await listBiz(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.profiles).toHaveLength(1);
  });

  it("GET fiscal locations returns catalog without requiring fiscalJurisdiction select", async () => {
    const req = new NextRequest(
      "http://localhost/api/admin/v1/fiscal/locations",
      { headers: { "x-tenant-id": "tenant-1" } },
    );
    const res = await listLocations(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.locations.length).toBeGreaterThan(5);
    expect(body.locations.some((l: { locationId: string }) => l.locationId === "gr-mainland")).toBe(
      true,
    );
    expect(
      body.locations.some((l: { locationId: string }) => l.locationId === "gr-island:limnos"),
    ).toBe(true);
    expect(
      body.locations.every(
        (l: { locationId: string }) => l.locationId !== "GR-ISLAND-REDUCED",
      ),
    ).toBe(true);
  });

  it("PUT business profile accepts location fields (not fiscalJurisdiction)", async () => {
    vi.mocked(upsertBusinessFiscalProfileUseCase.execute).mockResolvedValue(
      Result.ok({
        id: "b1",
        fiscalJurisdiction: "GR",
        establishmentLocationId: "gr-mainland",
      }) as never,
    );
    const req = new NextRequest(
      "http://localhost/api/admin/v1/fiscal/business-profiles",
      {
        method: "PUT",
        headers: { "x-tenant-id": "tenant-1", "content-type": "application/json" },
        body: JSON.stringify({
          propertyId: "11111111-1111-1111-1111-111111111111",
          legalName: "Hotel SA",
          country: "GR",
          establishmentLocationId: "gr-mainland",
          establishmentInEligibleArea: false,
          servicePhysicallyExecutedInEligibleArea: false,
          accommodationType: "hotel",
          propertyClassification: "hotel_stars_3",
          address: {
            line1: "1",
            city: "Athens",
            postalCode: "10552",
            country: "GR",
          },
          // fiscalJurisdiction must be ignored by schema — not in upsert payload
        }),
      },
    );
    const res = await upsertBiz(req);
    expect(res.status).toBe(200);
    expect(upsertBusinessFiscalProfileUseCase.execute).toHaveBeenCalledWith(
      "tenant-1",
      expect.anything(),
      expect.objectContaining({
        establishmentLocationId: "gr-mainland",
      }),
    );
    const callArg = vi.mocked(upsertBusinessFiscalProfileUseCase.execute).mock
      .calls[0]![2] as Record<string, unknown>;
    expect(callArg).not.toHaveProperty("fiscalJurisdiction");
  });

  it("POST evaluate-taxes", async () => {
    vi.mocked(evaluateAndPostFolioTaxesUseCase.execute).mockResolvedValue(
      Result.ok({ id: "f1", balance: { vatTotal: "13.0000" } }) as never,
    );
    const req = new NextRequest(
      "http://localhost/api/admin/v1/folios/f1/evaluate-taxes",
      {
        method: "POST",
        headers: { "x-tenant-id": "tenant-1", "content-type": "application/json" },
        body: JSON.stringify({ amountBasis: "NET" }),
      },
    );
    const res = await evalTaxes(req, {
      params: Promise.resolve({ folioId: "f1" }),
    });
    expect(res.status).toBe(200);
    expect(evaluateAndPostFolioTaxesUseCase.execute).toHaveBeenCalled();
  });
});
