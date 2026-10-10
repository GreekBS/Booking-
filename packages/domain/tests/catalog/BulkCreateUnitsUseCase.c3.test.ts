import { describe, expect, it, vi } from "vitest";
import {
  BulkCreateUnitsUseCase,
  ForbiddenError,
  NotFoundError,
  Property,
  RoomType,
  ValidationError,
  type ActorContext,
  type IPropertyRepository,
  type IRoomTypeRepository,
} from "../../src/index";
import { PermissionChecker } from "../../src/shared/services/PermissionChecker";

const TENANT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PROP = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const RT = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const admin: ActorContext = {
  userId: "admin",
  tenantId: TENANT,
  role: "admin",
  propertyIds: null,
};

const managerOther: ActorContext = {
  userId: "mgr",
  tenantId: TENANT,
  role: "manager",
  propertyIds: ["dddddddd-dddd-4ddd-8ddd-dddddddddddd"],
};

function propertyFixture() {
  return Property.create({
    id: PROP,
    tenantId: TENANT,
    name: "Hotel",
    slug: "hotel-c3",
    type: "hotel",
    defaultUnit: {
      id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      maxGuests: 2,
    },
  });
}

function roomTypeFixture(status: "active" | "inactive" = "active") {
  return RoomType.create({
    id: RT,
    tenantId: TENANT,
    propertyId: PROP,
    name: "Standard Double",
    code: "STD",
    maxGuests: 2,
    status,
  });
}

function buildRepos(opts?: {
  roomType?: RoomType | null;
  property?: Property | null;
}) {
  const property = opts && "property" in opts ? opts.property : propertyFixture();
  const roomType =
    opts && "roomType" in opts ? opts.roomType : roomTypeFixture();

  const propertyRepository: IPropertyRepository = {
    save: vi.fn(async () => undefined),
    findById: vi.fn(async () => property),
    findBySlug: vi.fn(),
    existsBySlug: vi.fn(),
    findAll: vi.fn(),
    listUnitCatalog: vi.fn(),
    mutateUnderLock: vi.fn(async (_t, _p, mutator, afterPersist) => {
      const locked = property!;
      await mutator(locked);
      if (afterPersist) await afterPersist(locked);
      return locked;
    }),
  };

  const roomTypeRepository: IRoomTypeRepository = {
    save: vi.fn(),
    findById: vi.fn(async () => roomType),
    listByProperty: vi.fn(),
    countLinkedUnits: vi.fn(),
  };

  let n = 0;
  const idGenerator = {
    generate: () => {
      n += 1;
      return `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
    },
  };

  return {
    propertyRepository,
    roomTypeRepository,
    idGenerator,
    permissionChecker: new PermissionChecker(),
    property: property!,
  };
}

describe("BulkCreateUnitsUseCase C3", () => {
  it("previews 20 rooms without persisting", async () => {
    const deps = buildRepos();
    const uc = new BulkCreateUnitsUseCase(
      deps.propertyRepository,
      deps.roomTypeRepository,
      deps.permissionChecker,
      deps.idGenerator,
    );

    const result = await uc.execute(
      {
        tenantId: TENANT,
        propertyId: PROP,
        roomTypeId: RT,
        numbering: { mode: "sequential", start: 101, count: 20 },
        preview: true,
      },
      admin,
    );

    expect(result.isSuccess).toBe(true);
    expect(result.getValue().preview).toBe(true);
    expect(result.getValue().planned).toHaveLength(20);
    expect(result.getValue().units).toHaveLength(0);
    expect(result.getValue().pricingTemplate).toBeNull();
    expect(deps.propertyRepository.mutateUnderLock).not.toHaveBeenCalled();
  });

  it("creates 20 physical units under lock", async () => {
    const deps = buildRepos();
    const uc = new BulkCreateUnitsUseCase(
      deps.propertyRepository,
      deps.roomTypeRepository,
      deps.permissionChecker,
      deps.idGenerator,
    );

    const result = await uc.execute(
      {
        tenantId: TENANT,
        propertyId: PROP,
        roomTypeId: RT,
        numbering: { mode: "sequential", start: 101, count: 20 },
      },
      admin,
    );

    expect(result.isSuccess).toBe(true);
    expect(result.getValue().units).toHaveLength(20);
    expect(result.getValue().units[0]!.roomNumber).toBe("101");
    expect(result.getValue().units[19]!.roomNumber).toBe("120");
    expect(result.getValue().units[0]!.roomTypeId).toBe(RT);
    // Default Entire Property remains (inactive placeholder for hotels — C3-H1)
    const placeholder = deps.property.units.find(
      (u) => u.slug === "entire-property",
    );
    expect(placeholder).toBeDefined();
    expect(placeholder!.status).toBe("inactive");
    expect(result.getValue().units.every((u) => u.status === "active")).toBe(
      true,
    );
    expect(result.getValue().pricingTemplate).toBeNull();
    expect(deps.propertyRepository.mutateUnderLock).toHaveBeenCalled();
  });

  it("rejects manager on unassigned property", async () => {
    const deps = buildRepos();
    const uc = new BulkCreateUnitsUseCase(
      deps.propertyRepository,
      deps.roomTypeRepository,
      deps.permissionChecker,
      deps.idGenerator,
    );

    const result = await uc.execute(
      {
        tenantId: TENANT,
        propertyId: PROP,
        roomTypeId: RT,
        numbering: { mode: "sequential", start: 1, count: 2 },
      },
      managerOther,
    );
    expect(result.getError()).toBeInstanceOf(ForbiddenError);
  });

  it("rejects inactive RoomType", async () => {
    const deps = buildRepos({ roomType: roomTypeFixture("inactive") });
    const uc = new BulkCreateUnitsUseCase(
      deps.propertyRepository,
      deps.roomTypeRepository,
      deps.permissionChecker,
      deps.idGenerator,
    );

    const result = await uc.execute(
      {
        tenantId: TENANT,
        propertyId: PROP,
        roomTypeId: RT,
        numbering: { mode: "sequential", start: 1, count: 2 },
      },
      admin,
    );
    expect(result.isFailure).toBe(true);
    expect(
      result.getError() instanceof ValidationError ||
        result.getError() instanceof NotFoundError,
    ).toBe(true);
  });

  it("rejects duplicate room numbers against existing units", async () => {
    const property = propertyFixture();
    property.addUnit({
      id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
      name: "Standard Double 105",
      slug: "room-105",
      maxGuests: 2,
      roomTypeId: RT,
      roomNumber: "105",
    });
    const deps = buildRepos({ property });
    const uc = new BulkCreateUnitsUseCase(
      deps.propertyRepository,
      deps.roomTypeRepository,
      deps.permissionChecker,
      deps.idGenerator,
    );

    const result = await uc.execute(
      {
        tenantId: TENANT,
        propertyId: PROP,
        roomTypeId: RT,
        numbering: { mode: "sequential", start: 101, count: 10 },
      },
      admin,
    );
    expect(result.isFailure).toBe(true);
    expect(result.getError().message).toMatch(/105/);
  });
});
