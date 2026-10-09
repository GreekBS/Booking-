import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import {
  ForbiddenError,
  NotFoundError,
  Result,
  RoomType,
  UnauthorizedError,
  ValidationError,
} from "@hcp/domain";

const requireTenantContext = vi.fn();
const toPermissionActor = vi.fn((actor: unknown) => actor);
const createExecute = vi.fn();
const listExecute = vi.fn();
const getExecute = vi.fn();
const updateExecute = vi.fn();
const deactivateExecute = vi.fn();

vi.mock("@/lib/tenant-context", () => ({
  requireTenantContext: (...args: unknown[]) => requireTenantContext(...args),
  toPermissionActor: (...args: unknown[]) => toPermissionActor(...args),
}));

vi.mock("@/lib/di/container", () => ({
  createRoomTypeUseCase: {
    execute: (...args: unknown[]) => createExecute(...args),
  },
  listRoomTypesUseCase: {
    execute: (...args: unknown[]) => listExecute(...args),
  },
  getRoomTypeUseCase: {
    execute: (...args: unknown[]) => getExecute(...args),
  },
  updateRoomTypeUseCase: {
    execute: (...args: unknown[]) => updateExecute(...args),
  },
  deactivateRoomTypeUseCase: {
    execute: (...args: unknown[]) => deactivateExecute(...args),
  },
}));

import {
  GET as listRoomTypes,
  POST as createRoomType,
} from "@/app/api/admin/v1/properties/[propertyId]/room-types/route";
import {
  GET as getRoomType,
  PATCH as patchRoomType,
  DELETE as deactivateRoomType,
} from "@/app/api/admin/v1/properties/[propertyId]/room-types/[roomTypeId]/route";

const TENANT = "11111111-1111-4111-8111-111111111111";
const PROP = "22222222-2222-4222-8222-222222222222";
const RT = "33333333-3333-4333-8333-333333333333";

const actor = {
  userId: "user-1",
  tenantId: TENANT,
  role: "admin" as const,
  propertyIds: null,
};

function roomTypeFixture() {
  return RoomType.create({
    id: RT,
    tenantId: TENANT,
    propertyId: PROP,
    name: "Standard Double",
    code: "STD",
    maxGuests: 2,
  });
}

function collectionReq(method: string, body?: unknown) {
  return new NextRequest(
    `http://localhost/api/admin/v1/properties/${PROP}/room-types`,
    {
      method,
      headers: {
        "content-type": "application/json",
        "x-tenant-id": TENANT,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    },
  );
}

function itemReq(method: string, body?: unknown) {
  return new NextRequest(
    `http://localhost/api/admin/v1/properties/${PROP}/room-types/${RT}`,
    {
      method,
      headers: {
        "content-type": "application/json",
        "x-tenant-id": TENANT,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    },
  );
}

describe("RoomType C2 admin APIs", () => {
  beforeEach(() => {
    requireTenantContext.mockReset().mockResolvedValue(actor);
    toPermissionActor.mockClear().mockImplementation((a: unknown) => a);
    createExecute.mockReset();
    listExecute.mockReset();
    getExecute.mockReset();
    updateExecute.mockReset();
    deactivateExecute.mockReset();
  });

  it("POST creates using session tenantId and route propertyId", async () => {
    const rt = roomTypeFixture();
    createExecute.mockResolvedValue(Result.ok(rt));

    const res = await createRoomType(
      collectionReq("POST", {
        name: "Standard Double",
        code: "STD",
        maxGuests: 2,
      }),
      { params: Promise.resolve({ propertyId: PROP }) },
    );

    expect(res.status).toBe(201);
    expect(createExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT,
        propertyId: PROP,
        name: "Standard Double",
        code: "STD",
        maxGuests: 2,
      }),
      actor,
    );
    const json = await res.json();
    expect(json.id).toBe(RT);
    expect(json.propertyId).toBe(PROP);
  });

  it("POST ignores forged tenantId/propertyId in body", async () => {
    createExecute.mockResolvedValue(Result.ok(roomTypeFixture()));

    await createRoomType(
      collectionReq("POST", {
        name: "Forged",
        maxGuests: 2,
        tenantId: "99999999-9999-4999-8999-999999999999",
        propertyId: "88888888-8888-4888-8888-888888888888",
      }),
      { params: Promise.resolve({ propertyId: PROP }) },
    );

    expect(createExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT,
        propertyId: PROP,
      }),
      actor,
    );
  });

  it("GET list returns roomTypes array", async () => {
    listExecute.mockResolvedValue(Result.ok([roomTypeFixture()]));
    const res = await listRoomTypes(collectionReq("GET"), {
      params: Promise.resolve({ propertyId: PROP }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.roomTypes).toHaveLength(1);
  });

  it("maps ForbiddenError from use case", async () => {
    listExecute.mockResolvedValue(Result.fail(new ForbiddenError()));
    const res = await listRoomTypes(collectionReq("GET"), {
      params: Promise.resolve({ propertyId: PROP }),
    });
    expect(res.status).toBe(403);
  });

  it("maps UnauthorizedError from auth", async () => {
    requireTenantContext.mockRejectedValue(new UnauthorizedError());
    const res = await listRoomTypes(collectionReq("GET"), {
      params: Promise.resolve({ propertyId: PROP }),
    });
    expect(res.status).toBe(401);
  });

  it("rejects invalid occupancy via zod", async () => {
    const res = await createRoomType(
      collectionReq("POST", {
        name: "Bad",
        maxGuests: 2,
        maxAdults: 2,
        maxChildren: 1,
      }),
      { params: Promise.resolve({ propertyId: PROP }) },
    );
    expect(res.status).toBe(400);
    expect(createExecute).not.toHaveBeenCalled();
  });

  it("GET item and PATCH update work", async () => {
    getExecute.mockResolvedValue(Result.ok(roomTypeFixture()));
    const getRes = await getRoomType(itemReq("GET"), {
      params: Promise.resolve({ propertyId: PROP, roomTypeId: RT }),
    });
    expect(getRes.status).toBe(200);

    const updated = roomTypeFixture();
    updated.update({ name: "Twin" });
    updateExecute.mockResolvedValue(Result.ok(updated));
    const patchRes = await patchRoomType(itemReq("PATCH", { name: "Twin" }), {
      params: Promise.resolve({ propertyId: PROP, roomTypeId: RT }),
    });
    expect(patchRes.status).toBe(200);
    expect(updateExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT,
        propertyId: PROP,
        roomTypeId: RT,
        name: "Twin",
      }),
      actor,
    );
  });

  it("DELETE soft-deactivates and returns linkedUnitCount", async () => {
    const rt = roomTypeFixture();
    rt.deactivate();
    deactivateExecute.mockResolvedValue(
      Result.ok({ roomType: rt, linkedUnitCount: 3 }),
    );

    const res = await deactivateRoomType(itemReq("DELETE"), {
      params: Promise.resolve({ propertyId: PROP, roomTypeId: RT }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.deactivated).toBe(true);
    expect(json.linkedUnitCount).toBe(3);
    expect(json.status).toBe("inactive");
  });

  it("maps NotFound and Validation errors", async () => {
    getExecute.mockResolvedValue(Result.fail(new NotFoundError("RoomType", RT)));
    const missing = await getRoomType(itemReq("GET"), {
      params: Promise.resolve({ propertyId: PROP, roomTypeId: RT }),
    });
    expect(missing.status).toBe(404);

    updateExecute.mockResolvedValue(Result.fail(new ValidationError("bad")));
    const bad = await patchRoomType(itemReq("PATCH", { name: "X" }), {
      params: Promise.resolve({ propertyId: PROP, roomTypeId: RT }),
    });
    expect(bad.status).toBe(400);
  });
});
