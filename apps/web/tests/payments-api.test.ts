import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/tenant-context", () => ({
  requireTenantContext: vi.fn(),
  toPermissionActor: vi.fn((actor: unknown) => actor),
}));

vi.mock("@/lib/di/container", () => ({
  recordManualPaymentUseCase: { execute: vi.fn() },
  listPaymentsUseCase: { execute: vi.fn() },
  getFolioSettlementUseCase: { execute: vi.fn() },
}));

import { requireTenantContext } from "@/lib/tenant-context";
import {
  recordManualPaymentUseCase,
  getFolioSettlementUseCase,
} from "@/lib/di/container";
import { POST as recordPayment } from "@/app/api/admin/v1/payments/route";
import { GET as getSettlement } from "@/app/api/admin/v1/folios/[folioId]/settlement/route";
import { Result } from "@hcp/domain";

describe("admin payment routes (F4)", () => {
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

  it("rejects POST payments without tenant header via requireTenantContext", async () => {
    vi.mocked(requireTenantContext).mockRejectedValue(new Error("Missing tenant"));
    const req = new NextRequest("http://localhost/api/admin/v1/payments", {
      method: "POST",
      body: JSON.stringify({
        amount: "100.0000",
        currency: "EUR",
        method: "CASH",
        collectionSource: "PROPERTY",
        idempotencyKey: "k1",
      }),
    });
    const res = await recordPayment(req);
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(recordManualPaymentUseCase.execute).not.toHaveBeenCalled();
  });

  it("POST record manual payment happy path", async () => {
    vi.mocked(recordManualPaymentUseCase.execute).mockResolvedValue(
      Result.ok({
        id: "pay-1",
        amount: "100.0000",
        currency: "EUR",
        status: "SUCCEEDED",
        method: "CASH",
        collectionSource: "PROPERTY",
      }) as never,
    );

    const req = new NextRequest("http://localhost/api/admin/v1/payments", {
      method: "POST",
      headers: { "x-tenant-id": "tenant-1", "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: "100.0000",
        currency: "EUR",
        method: "CASH",
        collectionSource: "PROPERTY",
        bookingId: "11111111-1111-4111-8111-111111111111",
        idempotencyKey: "idem-1",
      }),
    });
    const res = await recordPayment(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe("pay-1");
    expect(body.status).toBe("SUCCEEDED");
    expect(recordManualPaymentUseCase.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant-1",
        amount: "100.0000",
        bookingId: "11111111-1111-4111-8111-111111111111",
        idempotencyKey: "idem-1",
      }),
    );
  });

  it("GET folio settlement returns balance shape", async () => {
    vi.mocked(getFolioSettlementUseCase.execute).mockResolvedValue(
      Result.ok({
        balance: {
          folioTotal: "200.0000",
          paidAmount: "50.0000",
          netSettledAmount: "50.0000",
          refundedAmount: "0.0000",
          overpaymentAmount: "0.0000",
          outstandingBalance: "150.0000",
          paidAmountSource: "allocations",
          currency: "EUR",
        },
      }) as never,
    );

    const req = new NextRequest(
      "http://localhost/api/admin/v1/folios/f1/settlement",
      { headers: { "x-tenant-id": "tenant-1" } },
    );
    const res = await getSettlement(req, {
      params: Promise.resolve({
        folioId: "22222222-2222-4222-8222-222222222222",
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.balance.folioTotal).toBe("200.0000");
    expect(body.balance.netSettledAmount).toBe("50.0000");
    expect(getFolioSettlementUseCase.execute).toHaveBeenCalledWith(
      "tenant-1",
      "22222222-2222-4222-8222-222222222222",
      expect.anything(),
    );
  });
});
