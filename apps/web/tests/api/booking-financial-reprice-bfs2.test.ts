import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { ForbiddenError, Result } from "@hcp/domain";

const requireTenantContext = vi.fn();
const toPermissionActor = vi.fn((actor: unknown) => actor);
const previewExecute = vi.fn();
const applyExecute = vi.fn();

vi.mock("@/lib/tenant-context", () => ({
  requireTenantContext: (...args: unknown[]) => requireTenantContext(...args),
  toPermissionActor: (...args: unknown[]) => toPermissionActor(...args),
}));

vi.mock("@/lib/di/container", () => ({
  previewBookingFinancialRepriceUseCase: {
    execute: (...args: unknown[]) => previewExecute(...args),
  },
  applyBookingFinancialRepriceUseCase: {
    execute: (...args: unknown[]) => applyExecute(...args),
  },
}));

import { POST as previewPost } from "@/app/api/admin/v1/bookings/[bookingId]/financial-reprice/preview/route";
import { POST as applyPost } from "@/app/api/admin/v1/bookings/[bookingId]/financial-reprice/apply/route";

const TENANT = "11111111-1111-4111-8111-111111111111";
const BOOKING = "22222222-2222-4222-8222-222222222222";
const UNIT = "33333333-3333-4333-8333-333333333333";

const actor = {
  userId: "user-1",
  tenantId: TENANT,
  role: "admin" as const,
  propertyIds: null,
};

function previewReq(body: unknown) {
  return new NextRequest(
    `http://localhost/api/admin/v1/bookings/${BOOKING}/financial-reprice/preview`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-tenant-id": TENANT,
      },
      body: JSON.stringify(body),
    },
  );
}

function applyReq(body: unknown) {
  return new NextRequest(
    `http://localhost/api/admin/v1/bookings/${BOOKING}/financial-reprice/apply`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-tenant-id": TENANT,
      },
      body: JSON.stringify(body),
    },
  );
}

describe("BFS-2 booking financial-reprice admin API", () => {
  beforeEach(() => {
    requireTenantContext.mockReset().mockResolvedValue(actor);
    toPermissionActor.mockClear().mockImplementation((a: unknown) => a);
    previewExecute.mockReset();
    applyExecute.mockReset();
  });

  it("preview uses session tenant and route bookingId", async () => {
    previewExecute.mockResolvedValue(
      Result.ok({
        available: true,
        unchanged: false,
        reasons: [],
        current: {
          checkIn: "2025-08-01",
          checkOut: "2025-08-04",
          unitId: UNIT,
          guestCount: 2,
          totalAmount: "300.0000",
          currency: "EUR",
        },
        proposed: {
          checkIn: "2025-08-01",
          checkOut: "2025-08-05",
          unitId: UNIT,
          guestCount: 2,
          totalAmount: "600.0000",
          currency: "EUR",
        },
        priceDelta: { amount: "300.0000", currency: "EUR" },
        pricingIntent: "recalculate_from_rate_plan",
        proposedCommercial: {
          subtotalAmount: "600.0000",
          feesAmount: "0.0000",
          taxesAmount: "0.0000",
          discountAmount: "0.0000",
          totalAmount: "600.0000",
          currency: "EUR",
          lineItems: [],
          ratePlanFingerprint: "fp",
          pricingFingerprint: "a".repeat(64),
        },
        bookingId: BOOKING,
        currentQuoteId: "44444444-4444-4444-8444-444444444444",
        reason: "Commercial correction",
        confirmationToken: "token-aaaaaaaaaaaaaaaa",
        confirmationExpiresAt: new Date().toISOString(),
      }),
    );

    const res = await previewPost(
      previewReq({
        unitId: UNIT,
        checkIn: "2025-08-01",
        checkOut: "2025-08-05",
        guestCount: 2,
        reason: "Commercial correction",
        tenantId: "99999999-9999-4999-8999-999999999999",
      }),
      { params: Promise.resolve({ bookingId: BOOKING }) },
    );

    expect(res.status).toBe(200);
    expect(previewExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT,
        bookingId: BOOKING,
        unitId: UNIT,
        reason: "Commercial correction",
      }),
      actor,
    );
    const json = await res.json();
    expect(json.confirmationToken).toMatch(/^token-/);
    expect(json.priceDelta.amount).toBe("300.0000");
  });

  it("preview rejects missing reason", async () => {
    const res = await previewPost(
      previewReq({
        unitId: UNIT,
        checkIn: "2025-08-01",
        checkOut: "2025-08-05",
        guestCount: 2,
      }),
      { params: Promise.resolve({ bookingId: BOOKING }) },
    );
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(previewExecute).not.toHaveBeenCalled();
  });

  it("apply forwards confirmationToken and reason; returns success payload", async () => {
    applyExecute.mockResolvedValue(
      Result.ok({
        bookingId: BOOKING,
        amendmentId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        previousQuoteId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        newQuoteId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        previousTotalAmount: "300.0000",
        newTotalAmount: "600.0000",
        deltaAmount: "300.0000",
        currency: "EUR",
        replayed: false,
      }),
    );

    const res = await applyPost(
      applyReq({
        confirmationToken: "token-bbbbbbbbbbbbbbbb",
        reason: "Attempt apply",
      }),
      { params: Promise.resolve({ bookingId: BOOKING }) },
    );

    expect(res.status).toBe(200);
    expect(applyExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT,
        bookingId: BOOKING,
        confirmationToken: "token-bbbbbbbbbbbbbbbb",
        reason: "Attempt apply",
      }),
      actor,
    );
    const json = await res.json();
    expect(json.amendmentId).toBe("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    expect(json.deltaAmount).toBe("300.0000");
  });

  it("maps ForbiddenError from preview", async () => {
    previewExecute.mockResolvedValue(Result.fail(new ForbiddenError()));
    const res = await previewPost(
      previewReq({
        unitId: UNIT,
        checkIn: "2025-08-01",
        checkOut: "2025-08-05",
        guestCount: 2,
        reason: "Unauthorized",
      }),
      { params: Promise.resolve({ bookingId: BOOKING }) },
    );
    expect(res.status).toBe(403);
  });
});
