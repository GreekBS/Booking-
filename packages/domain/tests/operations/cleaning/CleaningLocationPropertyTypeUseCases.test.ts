import { describe, expect, it, vi } from "vitest";
import { PermissionChecker } from "../../../src/shared/services/PermissionChecker";
import type { ActorContext } from "../../../src/shared/services/PermissionChecker";
import {
  ConflictError,
  ForbiddenError,
  ValidationError,
} from "../../../src/shared/errors/DomainError";
import {
  AddCleaningLocationUseCase,
  ArchiveCleaningLocationUseCase,
  BulkInitializeCleaningLocationsUseCase,
  ListCleaningLocationsBoardUseCase,
} from "../../../src/operations/cleaning/application/CleaningLocationUseCases";
import type { CleaningLocationRecord } from "../../../src/operations/cleaning/domain/CleaningLocationTypes";
import type { PropertyType } from "../../../src/shared/types/index";

const TENANT = "tenant-1";
const PROPERTY = "prop-1";

const admin: ActorContext = {
  userId: "user-1",
  role: "admin",
  propertyIds: null,
  isSuperAdmin: false,
};

const managerOtherProperty: ActorContext = {
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
    id: "loc-1",
    tenantId: TENANT,
    propertyId: PROPERTY,
    name: "1",
    status: "active",
    sortOrder: 0,
    commercialUnitId: null,
    createdAt: now,
    updatedAt: now,
    archivedAt: null,
    ...overrides,
  };
}

function propertyRepo(type: PropertyType, name = "Demo Property") {
  return {
    findById: vi.fn(async () => ({ type, name })),
  } as never;
}

describe("Property.type-aware CleaningLocation use cases", () => {
  const permissionChecker = new PermissionChecker();

  it("hotel + zero locations: bulk initialize allowed", async () => {
    const bulkCreate = vi.fn(async () => [makeLocation({ name: "1" })]);
    const useCase = new BulkInitializeCleaningLocationsUseCase(
      {
        countActiveByProperty: vi.fn(async () => 0),
        bulkCreate,
      } as never,
      propertyRepo("hotel"),
      permissionChecker,
    );
    const result = await useCase.execute(
      { tenantId: TENANT, propertyId: PROPERTY, count: 3 },
      admin,
    );
    expect(result.isSuccess).toBe(true);
    expect(bulkCreate).toHaveBeenCalled();
  });

  it("villa rejects bulk room setup", async () => {
    const useCase = new BulkInitializeCleaningLocationsUseCase(
      { countActiveByProperty: vi.fn(), bulkCreate: vi.fn() } as never,
      propertyRepo("villa"),
      permissionChecker,
    );
    const result = await useCase.execute(
      { tenantId: TENANT, propertyId: PROPERTY, count: 5 },
      admin,
    );
    expect(result.isFailure).toBe(true);
    expect(result.getError()).toBeInstanceOf(ValidationError);
  });

  it("apartment and other reject add room", async () => {
    for (const type of ["apartment", "other"] as const) {
      const useCase = new AddCleaningLocationUseCase(
        { add: vi.fn() } as never,
        propertyRepo(type),
        permissionChecker,
      );
      const result = await useCase.execute(
        { tenantId: TENANT, propertyId: PROPERTY, name: "2" },
        admin,
      );
      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(ValidationError);
    }
  });

  it("hotel allows add room", async () => {
    const add = vi.fn(async () => makeLocation({ name: "12" }));
    const useCase = new AddCleaningLocationUseCase(
      { add } as never,
      propertyRepo("hotel"),
      permissionChecker,
    );
    const result = await useCase.execute(
      { tenantId: TENANT, propertyId: PROPERTY, name: "12" },
      admin,
    );
    expect(result.isSuccess).toBe(true);
    expect(add).toHaveBeenCalled();
  });

  it("villa board ensures exactly one location when none exist", async () => {
    const ensureSingleActive = vi.fn(async () => ({
      location: makeLocation({ name: "Demo Property" }),
      created: true,
    }));
    const getBoard = vi.fn(async () => [
      {
        locationId: "loc-1",
        propertyId: PROPERTY,
        name: "Demo Property",
        sortOrder: 0,
        commercialUnitId: null,
        readinessStatus: "CLEAN",
        readinessVersion: 1,
        readinessSource: "INIT",
        lastCompletedAt: null,
        openTask: null,
        hasActiveQr: false,
      },
    ]);
    const useCase = new ListCleaningLocationsBoardUseCase(
      {
        countActiveByProperty: vi.fn(async () => 0),
        ensureSingleActive,
        getBoard,
      } as never,
      propertyRepo("villa", "Demo Property"),
      permissionChecker,
    );
    const result = await useCase.execute(
      { tenantId: TENANT, propertyId: PROPERTY },
      admin,
    );
    expect(result.isSuccess).toBe(true);
    const board = result.getValue();
    expect(board.mode).toBe("single_property");
    expect(board.requiresManualResolution).toBe(false);
    expect(board.rows).toHaveLength(1);
    expect(ensureSingleActive).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Demo Property",
        propertyId: PROPERTY,
      }),
    );
  });

  it("villa with existing location reuses it (no ensure create path when count>0)", async () => {
    const ensureSingleActive = vi.fn();
    const useCase = new ListCleaningLocationsBoardUseCase(
      {
        countActiveByProperty: vi.fn(async () => 1),
        ensureSingleActive,
        getBoard: vi.fn(async () => [
          {
            locationId: "loc-existing",
            propertyId: PROPERTY,
            name: "Existing",
            sortOrder: 0,
            commercialUnitId: null,
            readinessStatus: "CLEAN",
            readinessVersion: 1,
            readinessSource: "INIT",
            lastCompletedAt: null,
            openTask: null,
            hasActiveQr: true,
          },
        ]),
      } as never,
      propertyRepo("villa"),
      permissionChecker,
    );
    const result = await useCase.execute(
      { tenantId: TENANT, propertyId: PROPERTY },
      admin,
    );
    expect(result.isSuccess).toBe(true);
    expect(ensureSingleActive).not.toHaveBeenCalled();
    expect(result.getValue().rows).toHaveLength(1);
  });

  it("apartment uses single_property mode", async () => {
    const useCase = new ListCleaningLocationsBoardUseCase(
      {
        countActiveByProperty: vi.fn(async () => 1),
        ensureSingleActive: vi.fn(),
        getBoard: vi.fn(async () => []),
      } as never,
      propertyRepo("apartment"),
      permissionChecker,
    );
    const result = await useCase.execute(
      { tenantId: TENANT, propertyId: PROPERTY },
      admin,
    );
    expect(result.getValue().mode).toBe("single_property");
    expect(result.getValue().propertyType).toBe("apartment");
  });

  it("other uses single_property mode", async () => {
    const useCase = new ListCleaningLocationsBoardUseCase(
      {
        countActiveByProperty: vi.fn(async () => 1),
        ensureSingleActive: vi.fn(),
        getBoard: vi.fn(async () => []),
      } as never,
      propertyRepo("other"),
      permissionChecker,
    );
    const result = await useCase.execute(
      { tenantId: TENANT, propertyId: PROPERTY },
      admin,
    );
    expect(result.getValue().mode).toBe("single_property");
  });

  it("hotel board does not auto-ensure locations", async () => {
    const ensureSingleActive = vi.fn();
    const useCase = new ListCleaningLocationsBoardUseCase(
      {
        countActiveByProperty: vi.fn(),
        ensureSingleActive,
        getBoard: vi.fn(async () => []),
      } as never,
      propertyRepo("hotel"),
      permissionChecker,
    );
    const result = await useCase.execute(
      { tenantId: TENANT, propertyId: PROPERTY },
      admin,
    );
    expect(result.getValue().mode).toBe("multi_room");
    expect(result.getValue().rows).toHaveLength(0);
    expect(ensureSingleActive).not.toHaveBeenCalled();
  });

  it("hotel→villa with multiple locations sets requiresManualResolution and preserves rows", async () => {
    const rows = [
      {
        locationId: "a",
        propertyId: PROPERTY,
        name: "1",
        sortOrder: 0,
        commercialUnitId: null,
        readinessStatus: "CLEAN" as const,
        readinessVersion: 1,
        readinessSource: "INIT",
        lastCompletedAt: null,
        openTask: null,
        hasActiveQr: false,
      },
      {
        locationId: "b",
        propertyId: PROPERTY,
        name: "2",
        sortOrder: 1,
        commercialUnitId: null,
        readinessStatus: "DIRTY" as const,
        readinessVersion: 2,
        readinessSource: "MANUAL",
        lastCompletedAt: null,
        openTask: null,
        hasActiveQr: true,
      },
    ];
    const ensureSingleActive = vi.fn();
    const useCase = new ListCleaningLocationsBoardUseCase(
      {
        countActiveByProperty: vi.fn(async () => 2),
        ensureSingleActive,
        getBoard: vi.fn(async () => rows),
      } as never,
      propertyRepo("villa"),
      permissionChecker,
    );
    const result = await useCase.execute(
      { tenantId: TENANT, propertyId: PROPERTY },
      admin,
    );
    expect(result.getValue().requiresManualResolution).toBe(true);
    expect(result.getValue().rows).toHaveLength(2);
    expect(ensureSingleActive).not.toHaveBeenCalled();
  });

  it("single-property mode refuses archiving the last active location", async () => {
    const archive = vi.fn();
    const useCase = new ArchiveCleaningLocationUseCase(
      {
        findById: vi.fn(async () => makeLocation()),
        countActiveByProperty: vi.fn(async () => 1),
        archive,
      } as never,
      propertyRepo("villa"),
      permissionChecker,
    );
    const result = await useCase.execute(
      { tenantId: TENANT, locationId: "loc-1" },
      admin,
    );
    expect(result.isFailure).toBe(true);
    expect(result.getError()).toBeInstanceOf(ConflictError);
    expect(archive).not.toHaveBeenCalled();
  });

  it("allows archive when resolving multi-location leftover in villa mode", async () => {
    const archive = vi.fn(async () => makeLocation({ status: "archived" }));
    const useCase = new ArchiveCleaningLocationUseCase(
      {
        findById: vi.fn(async () => makeLocation()),
        countActiveByProperty: vi.fn(async () => 3),
        archive,
      } as never,
      propertyRepo("villa"),
      permissionChecker,
    );
    const result = await useCase.execute(
      { tenantId: TENANT, locationId: "loc-1" },
      admin,
    );
    expect(result.isSuccess).toBe(true);
    expect(archive).toHaveBeenCalled();
  });

  it("preserves manager Active Property ACL on board", async () => {
    const useCase = new ListCleaningLocationsBoardUseCase(
      {
        countActiveByProperty: vi.fn(),
        ensureSingleActive: vi.fn(),
        getBoard: vi.fn(),
      } as never,
      propertyRepo("hotel"),
      permissionChecker,
    );
    const result = await useCase.execute(
      { tenantId: TENANT, propertyId: PROPERTY },
      managerOtherProperty,
    );
    expect(result.isFailure).toBe(true);
    expect(result.getError()).toBeInstanceOf(ForbiddenError);
  });

  it("type change does not destroy history: archive keeps same id", async () => {
    const existing = makeLocation({ id: "hist-1", name: "1" });
    const archive = vi.fn(async () => ({
      ...existing,
      status: "archived" as const,
      archivedAt: new Date(),
    }));
    const useCase = new ArchiveCleaningLocationUseCase(
      {
        findById: vi.fn(async () => existing),
        countActiveByProperty: vi.fn(async () => 2),
        archive,
      } as never,
      propertyRepo("villa"),
      permissionChecker,
    );
    const result = await useCase.execute(
      { tenantId: TENANT, locationId: "hist-1" },
      admin,
    );
    expect(result.getValue().id).toBe("hist-1");
    expect(result.getValue().status).toBe("archived");
  });
});
