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
  evaluateAndPostFolioTaxesUseCase,
} from "@/lib/di/container";
import { GET as listBiz } from "@/app/api/admin/v1/fiscal/business-profiles/route";
import { POST as evalTaxes } from "@/app/api/admin/v1/folios/[folioId]/evaluate-taxes/route";
import { Result } from "@hcp/domain";

describe("admin fiscal / tax routes (F2)", () => {
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
