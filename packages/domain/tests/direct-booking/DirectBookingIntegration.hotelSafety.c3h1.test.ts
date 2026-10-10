import { describe, expect, it, vi } from "vitest";
import { CreateDirectBookingIntegrationUseCase } from "../../src/direct-booking/application/DirectBookingIntegrationUseCases";
import { Property } from "../../src/catalog/domain/Property";
import { PermissionChecker } from "../../src/shared/services/PermissionChecker";
import type { IPropertyRepository } from "../../src/catalog/ports/ICatalogRepositories";
import type { IDirectBookingIntegrationRepository } from "../../src/direct-booking/ports/DirectBookingPorts";
import type { IIdGenerator } from "../../src/shared/ports/IIdGenerator";

const TENANT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PROP = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const DEFAULT_UNIT = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const ROOM_UNIT = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

const admin = {
  userId: "user-1",
  role: "admin" as const,
  propertyIds: null as string[] | null,
  isSuperAdmin: false,
};

function hotelWithInactiveDefaultAndActiveRoom() {
  const property = Property.create({
    id: PROP,
    tenantId: TENANT,
    name: "Hotel Safety",
    slug: "hotel-safety",
    type: "hotel",
    defaultUnit: { id: DEFAULT_UNIT, maxGuests: 2 },
  });
  property.addUnit({
    id: ROOM_UNIT,
    name: "Room 101",
    slug: "room-101",
    maxGuests: 2,
    roomNumber: "101",
  });
  return property;
}

function buildUseCase(property: Property, create = vi.fn(async (row) => row)) {
  const properties = {
    findById: vi.fn(async () => property),
    save: vi.fn(),
    findBySlug: vi.fn(),
    existsBySlug: vi.fn(),
    findAll: vi.fn(),
    listUnitCatalog: vi.fn(),
    mutateUnderLock: vi.fn(),
  } as unknown as IPropertyRepository;

  const integrations = {
    create,
  } as unknown as IDirectBookingIntegrationRepository;

  const idGenerator: IIdGenerator = {
    generate: () => "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
  };

  const uc = new CreateDirectBookingIntegrationUseCase(
    integrations,
    properties,
    new PermissionChecker(),
    idGenerator,
    () => ({ rawKey: "dbk_test_key" }),
  );

  return { uc, create };
}

describe("CreateDirectBookingIntegrationUseCase C3-H1", () => {
  it("does not auto-select inactive Entire Property on hotels", async () => {
    const property = hotelWithInactiveDefaultAndActiveRoom();
    expect(property.units.find((u) => u.id === DEFAULT_UNIT)?.status).toBe(
      "inactive",
    );

    const { uc, create } = buildUseCase(property);

    // Sole active commercial unit → auto-select room, not Entire Property.
    const result = await uc.execute(
      {
        tenantId: TENANT,
        propertyId: PROP,
        environment: "test",
        allowedOrigins: ["https://example.com"],
      },
      admin,
    );

    expect(result.isSuccess).toBe(true);
    expect(create).toHaveBeenCalled();
    expect(create.mock.calls[0]![0].unitId).toBe(ROOM_UNIT);
  });

  it("rejects explicit selection of inactive Entire Property", async () => {
    const property = hotelWithInactiveDefaultAndActiveRoom();
    const { uc } = buildUseCase(property);

    const result = await uc.execute(
      {
        tenantId: TENANT,
        propertyId: PROP,
        unitId: DEFAULT_UNIT,
        environment: "test",
        allowedOrigins: ["https://example.com"],
      },
      admin,
    );

    expect(result.isFailure).toBe(true);
  });

  it("fails when hotel has only the inactive placeholder", async () => {
    const property = Property.create({
      id: PROP,
      tenantId: TENANT,
      name: "Empty Hotel",
      slug: "empty-hotel",
      type: "hotel",
      defaultUnit: { id: DEFAULT_UNIT, maxGuests: 2 },
    });

    const { uc } = buildUseCase(property);

    const result = await uc.execute(
      {
        tenantId: TENANT,
        propertyId: PROP,
        environment: "test",
        allowedOrigins: ["https://example.com"],
      },
      admin,
    );

    expect(result.isFailure).toBe(true);
    expect(result.getError().message).toContain("no commercial units");
  });
});
