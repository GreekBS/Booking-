import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { ForbiddenError, Result, Unit } from "@hcp/domain";

const requireTenantContext = vi.fn();
const toPermissionActor = vi.fn((actor: unknown) => actor);
const bulkExecute = vi.fn();

vi.mock("@/lib/tenant-context", () => ({
  requireTenantContext: (...args: unknown[]) => requireTenantContext(...args),
  toPermissionActor: (...args: unknown[]) => toPermissionActor(...args),
}));

vi.mock("@/lib/di/container", () => ({
  bulkCreateUnitsUseCase: {
    execute: (...args: unknown[]) => bulkExecute(...args),
  },
}));

import { POST as bulkCreate } from "@/app/api/admin/v1/properties/[propertyId]/units/bulk/route";

const TENANT = "11111111-1111-4111-8111-111111111111";
const PROP = "22222222-2222-4222-8222-222222222222";
const RT = "33333333-3333-4333-8333-333333333333";

const actor = {
  userId: "user-1",
  tenantId: TENANT,
  role: "admin" as const,
  propertyIds: null,
};

function req(body: unknown, headers?: Record<string, string>) {
  return new NextRequest(
    `http://localhost/api/admin/v1/properties/${PROP}/units/bulk`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-tenant-id": TENANT,
        ...headers,
      },
      body: JSON.stringify(body),
    },
  );
}

describe("Units bulk C3 admin API", () => {
  beforeEach(() => {
    requireTenantContext.mockReset().mockResolvedValue(actor);
    toPermissionActor.mockClear().mockImplementation((a: unknown) => a);
    bulkExecute.mockReset();
  });

  it("creates units with session tenant and route propertyId", async () => {
    const unit = Unit.create({
      id: "44444444-4444-4444-8444-444444444444",
      tenantId: TENANT,
      propertyId: PROP,
      name: "Standard Double 101",
      slug: "room-101",
      maxGuests: 2,
      roomTypeId: RT,
      roomNumber: "101",
    });
    bulkExecute.mockResolvedValue(
      Result.ok({
        preview: false,
        planned: [
          {
            name: unit.name,
            slug: unit.slug,
            roomNumber: "101",
            floor: null,
            maxGuests: 2,
            roomTypeId: RT,
            bedrooms: 1,
            bathrooms: 1,
          },
        ],
        units: [unit],
        clientRequestId: "req-1",
      }),
    );

    const res = await bulkCreate(
      req(
        {
          roomTypeId: RT,
          numbering: { mode: "sequential", start: 101, count: 1 },
          tenantId: "99999999-9999-4999-8999-999999999999",
          propertyId: "88888888-8888-4888-8888-888888888888",
        },
        { "idempotency-key": "req-1" },
      ),
      { params: Promise.resolve({ propertyId: PROP }) },
    );

    expect(res.status).toBe(201);
    expect(bulkExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT,
        propertyId: PROP,
        roomTypeId: RT,
        clientRequestId: "req-1",
      }),
      actor,
    );
    const json = await res.json();
    expect(json.count).toBe(1);
    expect(json.units[0].roomNumber).toBe("101");
  });

  it("returns preview without creation status 200", async () => {
    bulkExecute.mockResolvedValue(
      Result.ok({
        preview: true,
        planned: Array.from({ length: 20 }, (_, i) => ({
          name: `Standard Double ${101 + i}`,
          slug: `room-${101 + i}`,
          roomNumber: String(101 + i),
          floor: null,
          maxGuests: 2,
          roomTypeId: RT,
          bedrooms: 1,
          bathrooms: 1,
        })),
        units: [],
        clientRequestId: null,
      }),
    );

    const res = await bulkCreate(
      req({
        roomTypeId: RT,
        numbering: { mode: "sequential", start: 101, count: 20 },
        preview: true,
      }),
      { params: Promise.resolve({ propertyId: PROP }) },
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.preview).toBe(true);
    expect(json.count).toBe(20);
  });

  it("maps ForbiddenError", async () => {
    bulkExecute.mockResolvedValue(Result.fail(new ForbiddenError()));
    const res = await bulkCreate(
      req({
        roomTypeId: RT,
        numbering: { mode: "sequential", start: 1, count: 2 },
      }),
      { params: Promise.resolve({ propertyId: PROP }) },
    );
    expect(res.status).toBe(403);
  });

  it("rejects count over 200 via zod", async () => {
    const res = await bulkCreate(
      req({
        roomTypeId: RT,
        numbering: { mode: "sequential", start: 1, count: 201 },
      }),
      { params: Promise.resolve({ propertyId: PROP }) },
    );
    expect(res.status).toBe(400);
    expect(bulkExecute).not.toHaveBeenCalled();
  });
});
