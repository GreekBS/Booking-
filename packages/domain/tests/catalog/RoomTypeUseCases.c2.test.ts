import { describe, expect, it, vi } from "vitest";
import {
  ConflictError,
  CreateRoomTypeUseCase,
  DeactivateRoomTypeUseCase,
  ForbiddenError,
  GetRoomTypeUseCase,
  ListRoomTypesUseCase,
  NotFoundError,
  Property,
  RoomType,
  UpdateRoomTypeUseCase,
  ValidationError,
  type ActorContext,
  type IPropertyRepository,
  type IRoomTypeRepository,
} from "../../src/index";
import { PermissionChecker } from "../../src/shared/services/PermissionChecker";

const TENANT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PROP_A = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const PROP_B = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const RT_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

const admin: ActorContext = {
  userId: "user-admin",
  tenantId: TENANT,
  role: "admin",
  propertyIds: null,
};

const managerAssigned: ActorContext = {
  userId: "user-mgr",
  tenantId: TENANT,
  role: "manager",
  propertyIds: [PROP_A],
};

const managerOther: ActorContext = {
  userId: "user-mgr-2",
  tenantId: TENANT,
  role: "manager",
  propertyIds: [PROP_B],
};

function propertyFixture(propertyId = PROP_A) {
  return Property.create({
    id: propertyId,
    tenantId: TENANT,
    name: "Hotel",
    slug: `hotel-${propertyId.slice(0, 6)}`,
    type: "hotel",
    defaultUnit: {
      id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      maxGuests: 2,
    },
  });
}

function roomTypeFixture(overrides?: Partial<{ propertyId: string; deletedAt: Date | null }>) {
  const rt = RoomType.create({
    id: RT_ID,
    tenantId: TENANT,
    propertyId: overrides?.propertyId ?? PROP_A,
    name: "Standard Double",
    code: "STD",
    maxGuests: 2,
  });
  if (overrides?.deletedAt) {
    rt.deactivate();
  }
  return rt;
}

function repos(opts?: {
  property?: Property | null;
  roomType?: RoomType | null;
  list?: RoomType[];
  linkedUnits?: number;
  saveError?: Error;
}) {
  const propertyRepository: IPropertyRepository = {
    save: vi.fn(),
    findById: vi.fn(async () =>
      opts && "property" in opts ? opts.property! : propertyFixture(),
    ),
    findBySlug: vi.fn(),
    existsBySlug: vi.fn(),
    findAll: vi.fn(),
    listUnitCatalog: vi.fn(),
    mutateUnderLock: vi.fn(),
  };

  const roomTypeRepository: IRoomTypeRepository = {
    save: vi.fn(async () => {
      if (opts?.saveError) throw opts.saveError;
    }),
    findById: vi.fn(async () =>
      opts && "roomType" in opts ? opts.roomType! : roomTypeFixture(),
    ),
    listByProperty: vi.fn(async () => opts?.list ?? [roomTypeFixture()]),
    countLinkedUnits: vi.fn(async () => opts?.linkedUnits ?? 0),
  };

  const idGenerator = { generate: () => RT_ID };
  const permissionChecker = new PermissionChecker();

  return { propertyRepository, roomTypeRepository, idGenerator, permissionChecker };
}

describe("RoomType C2 use cases", () => {
  it("creates a RoomType for an authorized admin", async () => {
    const { propertyRepository, roomTypeRepository, idGenerator, permissionChecker } =
      repos();
    const uc = new CreateRoomTypeUseCase(
      roomTypeRepository,
      propertyRepository,
      permissionChecker,
      idGenerator,
    );

    const result = await uc.execute(
      {
        tenantId: TENANT,
        propertyId: PROP_A,
        name: "Deluxe",
        code: "DLX",
        maxGuests: 3,
        maxAdults: 2,
        maxChildren: 1,
      },
      admin,
    );

    expect(result.isSuccess).toBe(true);
    expect(result.getValue().name).toBe("Deluxe");
    expect(roomTypeRepository.save).toHaveBeenCalled();
  });

  it("rejects manager access to an unassigned property", async () => {
    const { propertyRepository, roomTypeRepository, idGenerator, permissionChecker } =
      repos();
    const uc = new CreateRoomTypeUseCase(
      roomTypeRepository,
      propertyRepository,
      permissionChecker,
      idGenerator,
    );

    const result = await uc.execute(
      {
        tenantId: TENANT,
        propertyId: PROP_A,
        name: "Deluxe",
        maxGuests: 2,
      },
      managerOther,
    );

    expect(result.isFailure).toBe(true);
    expect(result.getError()).toBeInstanceOf(ForbiddenError);
    expect(roomTypeRepository.save).not.toHaveBeenCalled();
  });

  it("allows manager on assigned property to list RoomTypes", async () => {
    const { propertyRepository, roomTypeRepository, permissionChecker } = repos();
    const uc = new ListRoomTypesUseCase(
      roomTypeRepository,
      propertyRepository,
      permissionChecker,
    );

    const result = await uc.execute(
      { tenantId: TENANT, propertyId: PROP_A },
      managerAssigned,
    );
    expect(result.isSuccess).toBe(true);
    expect(result.getValue()).toHaveLength(1);
  });

  it("rejects invalid occupancy on create", async () => {
    const { propertyRepository, roomTypeRepository, idGenerator, permissionChecker } =
      repos();
    const uc = new CreateRoomTypeUseCase(
      roomTypeRepository,
      propertyRepository,
      permissionChecker,
      idGenerator,
    );

    const result = await uc.execute(
      {
        tenantId: TENANT,
        propertyId: PROP_A,
        name: "Too Full",
        maxGuests: 2,
        maxAdults: 2,
        maxChildren: 1,
      },
      admin,
    );

    expect(result.isFailure).toBe(true);
    expect(result.getError()).toBeInstanceOf(ValidationError);
  });

  it("maps duplicate code conflicts from persistence", async () => {
    const { propertyRepository, roomTypeRepository, idGenerator, permissionChecker } =
      repos({ saveError: new ConflictError("duplicate") });
    const uc = new CreateRoomTypeUseCase(
      roomTypeRepository,
      propertyRepository,
      permissionChecker,
      idGenerator,
    );

    const result = await uc.execute(
      {
        tenantId: TENANT,
        propertyId: PROP_A,
        name: "Standard",
        code: "STD",
        maxGuests: 2,
      },
      admin,
    );

    expect(result.isFailure).toBe(true);
    expect(result.getError()).toBeInstanceOf(ConflictError);
  });

  it("updates an existing RoomType", async () => {
    const { propertyRepository, roomTypeRepository, permissionChecker } = repos();
    const uc = new UpdateRoomTypeUseCase(
      roomTypeRepository,
      propertyRepository,
      permissionChecker,
    );

    const result = await uc.execute(
      {
        tenantId: TENANT,
        propertyId: PROP_A,
        roomTypeId: RT_ID,
        name: "Standard Twin",
        maxGuests: 2,
      },
      admin,
    );

    expect(result.isSuccess).toBe(true);
    expect(result.getValue().name).toBe("Standard Twin");
  });

  it("soft-deactivates even when Units remain linked", async () => {
    const { propertyRepository, roomTypeRepository, permissionChecker } = repos({
      linkedUnits: 5,
    });
    const uc = new DeactivateRoomTypeUseCase(
      roomTypeRepository,
      propertyRepository,
      permissionChecker,
    );

    const result = await uc.execute(
      { tenantId: TENANT, propertyId: PROP_A, roomTypeId: RT_ID },
      admin,
    );

    expect(result.isSuccess).toBe(true);
    expect(result.getValue().linkedUnitCount).toBe(5);
    expect(result.getValue().roomType.deletedAt).not.toBeNull();
    expect(result.getValue().roomType.status).toBe("inactive");
  });

  it("get returns NotFound for missing RoomType", async () => {
    const { propertyRepository, roomTypeRepository, permissionChecker } = repos({
      roomType: null,
    });
    const uc = new GetRoomTypeUseCase(
      roomTypeRepository,
      propertyRepository,
      permissionChecker,
    );

    const result = await uc.execute(TENANT, PROP_A, RT_ID, admin);
    expect(result.isFailure).toBe(true);
    expect(result.getError()).toBeInstanceOf(NotFoundError);
  });

  it("returns NotFound when property is missing", async () => {
    const { propertyRepository, roomTypeRepository, idGenerator, permissionChecker } =
      repos({ property: null });
    const uc = new CreateRoomTypeUseCase(
      roomTypeRepository,
      propertyRepository,
      permissionChecker,
      idGenerator,
    );

    const result = await uc.execute(
      {
        tenantId: TENANT,
        propertyId: PROP_A,
        name: "X",
        maxGuests: 2,
      },
      admin,
    );
    expect(result.getError()).toBeInstanceOf(NotFoundError);
  });
});
