import { describe, expect, it, vi } from "vitest";
import { PermissionChecker } from "../../../src/shared/services/PermissionChecker";
import type { ActorContext } from "../../../src/shared/services/PermissionChecker";
import { ForbiddenError, NotFoundError } from "../../../src/shared/errors/DomainError";
import {
  ResolveCleaningQrUseCase,
  RotateCleaningLocationQrUseCase,
  GenerateCleaningLocationQrUseCase,
} from "../../../src/operations/cleaning/application/CleaningLocationQrUseCases";
import type { CleaningLocationRecord } from "../../../src/operations/cleaning/domain/CleaningLocationTypes";
import type { CleaningLocationQrAccessRecord } from "../../../src/operations/cleaning/domain/CleaningLocationTypes";

const TENANT = "tenant-1";
const PROPERTY = "prop-1";
const LOCATION_ID = "loc-1";
const UNIT_ID = "unit-1";
const TOKEN =
  "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const TOKEN_HASH = "hash-of-token";

const actor: ActorContext = {
  userId: "user-1",
  role: "admin",
  propertyIds: null,
  isSuperAdmin: false,
};

const otherPropertyActor: ActorContext = {
  userId: "mgr-1",
  role: "manager",
  propertyIds: ["prop-other"],
  isSuperAdmin: false,
};

function makeLocation(
  overrides?: Partial<CleaningLocationRecord>,
): CleaningLocationRecord {
  const now = new Date("2026-09-28T00:00:00.000Z");
  return {
    id: LOCATION_ID,
    tenantId: TENANT,
    propertyId: PROPERTY,
    name: "1",
    status: "active",
    sortOrder: 0,
    commercialUnitId: UNIT_ID,
    createdAt: now,
    updatedAt: now,
    archivedAt: null,
    ...overrides,
  };
}

function makeLocationQr(
  overrides?: Partial<CleaningLocationQrAccessRecord>,
): CleaningLocationQrAccessRecord {
  const now = new Date("2026-09-28T00:00:00.000Z");
  return {
    id: "lqr-1",
    tenantId: TENANT,
    propertyId: PROPERTY,
    cleaningLocationId: LOCATION_ID,
    tokenHash: TOKEN_HASH,
    status: "ACTIVE",
    createdAt: now,
    rotatedAt: null,
    revokedAt: null,
    ...overrides,
  };
}

describe("ResolveCleaningQrUseCase", () => {
  it("resolves an active location QR token", async () => {
    const location = makeLocation({ commercialUnitId: null });
    const useCase = new ResolveCleaningQrUseCase(
      {
        findByTokenHash: vi.fn(async () => makeLocationQr()),
        findActiveByLocation: vi.fn(),
        issue: vi.fn(),
      } as never,
      {
        findActiveByTokenHash: vi.fn(async () => null),
      } as never,
      {
        findById: vi.fn(async () => location),
        findActiveByCommercialUnit: vi.fn(),
      } as never,
      {
        listUnitCatalog: vi.fn(async () => ({
          properties: [{ id: PROPERTY, name: "Hotel" }],
        })),
      } as never,
      {
        hash: vi.fn(() => TOKEN_HASH),
        create: vi.fn(),
      } as never,
      new PermissionChecker(),
    );

    const result = await useCase.execute({ tenantId: TENANT, token: TOKEN }, actor);
    expect(result.isSuccess).toBe(true);
    expect(result.getValue()).toEqual({
      locationId: LOCATION_ID,
      locationName: "1",
      propertyId: PROPERTY,
      propertyName: "Hotel",
      unitId: null,
    });
  });

  it("resolves legacy unit QR to the linked CleaningLocation", async () => {
    const location = makeLocation();
    const unitQrFind = vi.fn(async () => ({
      id: "uqr-1",
      tenantId: TENANT,
      propertyId: PROPERTY,
      unitId: UNIT_ID,
      tokenHash: TOKEN_HASH,
      status: "ACTIVE",
      createdAt: new Date(),
      rotatedAt: null,
      revokedAt: null,
    }));
    const locationQrFind = vi.fn(async () => null);

    const useCase = new ResolveCleaningQrUseCase(
      {
        findByTokenHash: locationQrFind,
        findActiveByLocation: vi.fn(),
        issue: vi.fn(),
      } as never,
      { findActiveByTokenHash: unitQrFind } as never,
      {
        findById: vi.fn(),
        findActiveByCommercialUnit: vi.fn(async () => location),
      } as never,
      {
        listUnitCatalog: vi.fn(async () => ({
          properties: [{ id: PROPERTY, name: "Villa" }],
        })),
      } as never,
      {
        hash: vi.fn(() => TOKEN_HASH),
        create: vi.fn(),
      } as never,
      new PermissionChecker(),
    );

    const result = await useCase.execute({ tenantId: TENANT, token: TOKEN }, actor);
    expect(result.isSuccess).toBe(true);
    expect(locationQrFind).toHaveBeenCalled();
    expect(unitQrFind).toHaveBeenCalled();
    expect(result.getValue()).toMatchObject({
      locationId: LOCATION_ID,
      locationName: "1",
      unitId: UNIT_ID,
      propertyName: "Villa",
    });
  });

  it("rejects cross-property manager access", async () => {
    const useCase = new ResolveCleaningQrUseCase(
      {
        findByTokenHash: vi.fn(async () => makeLocationQr()),
        findActiveByLocation: vi.fn(),
        issue: vi.fn(),
      } as never,
      { findActiveByTokenHash: vi.fn(async () => null) } as never,
      {
        findById: vi.fn(async () => makeLocation()),
        findActiveByCommercialUnit: vi.fn(),
      } as never,
      {
        listUnitCatalog: vi.fn(async () => ({ properties: [] })),
      } as never,
      {
        hash: vi.fn(() => TOKEN_HASH),
        create: vi.fn(),
      } as never,
      new PermissionChecker(),
    );

    const result = await useCase.execute(
      { tenantId: TENANT, token: TOKEN },
      otherPropertyActor,
    );
    expect(result.isFailure).toBe(true);
    expect(result.getError()).toBeInstanceOf(ForbiddenError);
  });

  it("fails when neither location nor unit QR matches", async () => {
    const useCase = new ResolveCleaningQrUseCase(
      {
        findByTokenHash: vi.fn(async () => null),
        findActiveByLocation: vi.fn(),
        issue: vi.fn(),
      } as never,
      { findActiveByTokenHash: vi.fn(async () => null) } as never,
      {
        findById: vi.fn(),
        findActiveByCommercialUnit: vi.fn(),
      } as never,
      { listUnitCatalog: vi.fn() } as never,
      {
        hash: vi.fn(() => TOKEN_HASH),
        create: vi.fn(),
      } as never,
      new PermissionChecker(),
    );

    const result = await useCase.execute({ tenantId: TENANT, token: TOKEN }, actor);
    expect(result.isFailure).toBe(true);
    expect(result.getError()).toBeInstanceOf(NotFoundError);
  });
});

describe("Generate / Rotate CleaningLocation QR", () => {
  it("generate returns plaintext token only when newly issued", async () => {
    const location = makeLocation({ commercialUnitId: null });
    const issue = vi.fn(async () => ({
      record: makeLocationQr(),
      issued: true,
    }));
    const useCase = new GenerateCleaningLocationQrUseCase(
      {
        findByTokenHash: vi.fn(),
        findActiveByLocation: vi.fn(),
        issue,
      } as never,
      {
        findById: vi.fn(async () => location),
        findActiveByCommercialUnit: vi.fn(),
      } as never,
      {
        listUnitCatalog: vi.fn(async () => ({
          properties: [{ id: PROPERTY, name: "Hotel" }],
        })),
      } as never,
      {
        create: vi.fn(() => ({ token: TOKEN, tokenHash: TOKEN_HASH })),
        hash: vi.fn(),
      } as never,
      new PermissionChecker(),
    );

    const result = await useCase.execute(
      { tenantId: TENANT, locationId: LOCATION_ID },
      actor,
    );
    expect(result.isSuccess).toBe(true);
    expect(result.getValue().token).toBe(TOKEN);
    expect(issue).toHaveBeenCalledWith(
      expect.objectContaining({ rotate: false }),
    );
  });

  it("rotate always mints a new token", async () => {
    const location = makeLocation({ commercialUnitId: null });
    const issue = vi.fn(async () => ({
      record: makeLocationQr({ id: "lqr-2" }),
      issued: true,
    }));
    const useCase = new RotateCleaningLocationQrUseCase(
      {
        findByTokenHash: vi.fn(),
        findActiveByLocation: vi.fn(),
        issue,
      } as never,
      {
        findById: vi.fn(async () => location),
        findActiveByCommercialUnit: vi.fn(),
      } as never,
      {
        listUnitCatalog: vi.fn(async () => ({
          properties: [{ id: PROPERTY, name: "Hotel" }],
        })),
      } as never,
      {
        create: vi.fn(() => ({ token: TOKEN, tokenHash: TOKEN_HASH })),
        hash: vi.fn(),
      } as never,
      new PermissionChecker(),
    );

    const result = await useCase.execute(
      { tenantId: TENANT, locationId: LOCATION_ID },
      actor,
    );
    expect(result.isSuccess).toBe(true);
    expect(result.getValue().token).toBe(TOKEN);
    expect(issue).toHaveBeenCalledWith(
      expect.objectContaining({ rotate: true }),
    );
  });
});
