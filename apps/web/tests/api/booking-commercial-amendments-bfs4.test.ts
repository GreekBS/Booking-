import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { ForbiddenError, NotFoundError, Result } from "@hcp/domain";

const requireTenantContext = vi.fn();
const toPermissionActor = vi.fn((actor: unknown) => actor);
const listExecute = vi.fn();

vi.mock("@/lib/tenant-context", () => ({
  requireTenantContext: (...args: unknown[]) => requireTenantContext(...args),
  toPermissionActor: (...args: unknown[]) => toPermissionActor(...args),
}));

vi.mock("@/lib/di/container", () => ({
  listBookingCommercialAmendmentsUseCase: {
    execute: (...args: unknown[]) => listExecute(...args),
  },
}));

import { GET } from "@/app/api/admin/v1/bookings/[bookingId]/commercial-amendments/route";

const TENANT = "11111111-1111-4111-8111-111111111111";
const BOOKING = "22222222-2222-4222-8222-222222222222";

const actor = {
  userId: "user-1",
  tenantId: TENANT,
  role: "admin" as const,
  propertyIds: null,
};

function listReq() {
  return new NextRequest(
    `http://localhost/api/admin/v1/bookings/${BOOKING}/commercial-amendments`,
    {
      method: "GET",
      headers: { "x-tenant-id": TENANT },
    },
  );
}

describe("BFS-4 booking commercial-amendments admin API", () => {
  beforeEach(() => {
    requireTenantContext.mockReset().mockResolvedValue(actor);
    toPermissionActor.mockClear().mockImplementation((a: unknown) => a);
    listExecute.mockReset();
  });

  it("lists amendments with session tenant and route bookingId", async () => {
    listExecute.mockResolvedValue(
      Result.ok([
        {
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          bookingId: BOOKING,
          propertyId: "33333333-3333-4333-8333-333333333333",
          previousQuoteId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          newQuoteId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
          previousTotalAmount: "300.0000",
          newTotalAmount: "450.0000",
          deltaAmount: "150.0000",
          currency: "EUR",
          pricingIntent: "recalculate_from_rate_plan",
          reason: "Rate plan correction",
          actorId: "user-1",
          mutationOrigin: "operator",
          createdAt: "2026-01-02T10:00:00.000Z",
        },
      ]),
    );

    const res = await GET(listReq(), {
      params: Promise.resolve({ bookingId: BOOKING }),
    });
    expect(res.status).toBe(200);
    expect(listExecute).toHaveBeenCalledWith(TENANT, BOOKING, actor);
    const json = await res.json();
    expect(json.amendments).toHaveLength(1);
    expect(json.amendments[0].deltaAmount).toBe("150.0000");
    expect(json.amendments[0]).not.toHaveProperty("confirmationReference");
    expect(json.amendments[0]).not.toHaveProperty("idempotencyKey");
    expect(json.amendments[0]).not.toHaveProperty("pricingFingerprint");
  });

  it("maps ForbiddenError", async () => {
    listExecute.mockResolvedValue(Result.fail(new ForbiddenError()));
    const res = await GET(listReq(), {
      params: Promise.resolve({ bookingId: BOOKING }),
    });
    expect(res.status).toBe(403);
  });

  it("maps NotFoundError", async () => {
    listExecute.mockResolvedValue(
      Result.fail(new NotFoundError("Booking", BOOKING)),
    );
    const res = await GET(listReq(), {
      params: Promise.resolve({ bookingId: BOOKING }),
    });
    expect(res.status).toBe(404);
  });
});
