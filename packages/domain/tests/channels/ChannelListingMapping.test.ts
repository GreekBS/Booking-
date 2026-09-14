import { describe, it, expect, beforeEach } from "vitest";
import { ChannelListingMapping } from "../../src/channels/domain/ChannelListingMapping";
import { ConflictError, ValidationError } from "../../src/shared/errors/DomainError";
import { InMemoryChannelListingMappingRepository } from "../../src/channels/repositories/InMemoryChannelListingMappingRepository";

const TENANT_ID = "550e8400-e29b-41d4-a716-446655440010";
const CONNECTION_ID = "550e8400-e29b-41d4-a716-446655440011";
const MAPPING_ID = "550e8400-e29b-41d4-a716-446655440012";
const PROPERTY_ID = "550e8400-e29b-41d4-a716-446655440013";
const UNIT_ID = "550e8400-e29b-41d4-a716-446655440014";

function createActive(overrides: Partial<Parameters<typeof ChannelListingMapping.createActive>[0]> = {}) {
  return ChannelListingMapping.createActive({
    id: MAPPING_ID,
    tenantId: TENANT_ID,
    connectionId: CONNECTION_ID,
    externalListingId: "listing-100",
    externalUnitId: "room-a",
    propertyId: PROPERTY_ID,
    unitId: UNIT_ID,
    syncDirection: "bidirectional",
    now: new Date("2027-01-01T00:00:00.000Z"),
    ...overrides,
  });
}

describe("ChannelListingMapping", () => {
  it("creates an active mapping at version 1", () => {
    const mapping = createActive();

    expect(mapping.status).toBe("active");
    expect(mapping.mappingVersion).toBe(1);
    expect(mapping.externalListingId).toBe("listing-100");
    expect(mapping.externalUnitId).toBe("room-a");
  });

  it("pauses and resumes an active mapping without changing version", () => {
    const mapping = createActive();
    mapping.pause(new Date("2027-01-01T01:00:00.000Z"));
    expect(mapping.status).toBe("paused");

    mapping.resume(new Date("2027-01-01T02:00:00.000Z"));
    expect(mapping.status).toBe("active");
    expect(mapping.mappingVersion).toBe(1);
  });

  it("rejects pause from paused status", () => {
    const mapping = createActive();
    mapping.pause();
    expect(() => mapping.pause()).toThrow(ConflictError);
  });

  it("rejects resume from active status", () => {
    expect(() => createActive().resume()).toThrow(ConflictError);
  });

  it("marks an active mapping as unmapped", () => {
    const mapping = createActive();
    mapping.markUnmapped(new Date("2027-01-01T03:00:00.000Z"));

    expect(mapping.status).toBe("unmapped");
    expect(mapping.mappingVersion).toBe(1);
  });

  it("rejects markUnmapped when already unmapped", () => {
    const mapping = createActive();
    mapping.markUnmapped();
    expect(() => mapping.markUnmapped()).toThrow(ConflictError);
  });

  it("marks error with a safe message", () => {
    const mapping = createActive();
    mapping.markError("listing not found");

    expect(mapping.status).toBe("error");
    expect(mapping.lastError).toBe("listing not found");
    expect(mapping.mappingVersion).toBe(1);
  });

  it("rejects markError on archived mapping", () => {
    const mapping = createActive();
    mapping.archive();
    expect(() => mapping.markError("too late")).toThrow(ConflictError);
  });

  it("archives a mapping and blocks further mutations", () => {
    const mapping = createActive();
    mapping.archive(new Date("2027-01-01T04:00:00.000Z"));

    expect(mapping.status).toBe("archived");
    expect(() => mapping.pause()).toThrow(ConflictError);
    expect(() =>
      mapping.updateInternalMapping({
        propertyId: PROPERTY_ID,
        unitId: "550e8400-e29b-41d4-a716-446655440099",
      }),
    ).toThrow(ConflictError);
  });

  it("reactivates unmapped mapping on external structural update and increments version", () => {
    const mapping = createActive();
    mapping.markUnmapped();
    mapping.updateExternalMapping(
      { externalListingId: "listing-200", externalUnitId: "room-b" },
      new Date("2027-01-01T05:00:00.000Z"),
    );

    expect(mapping.status).toBe("active");
    expect(mapping.externalListingId).toBe("listing-200");
    expect(mapping.mappingVersion).toBe(2);
  });

  it("keeps paused status on structural update and increments version", () => {
    const mapping = createActive();
    mapping.pause();
    mapping.updateInternalMapping(
      {
        propertyId: PROPERTY_ID,
        unitId: "550e8400-e29b-41d4-a716-446655440099",
      },
      new Date("2027-01-01T06:00:00.000Z"),
    );

    expect(mapping.status).toBe("paused");
    expect(mapping.mappingVersion).toBe(2);
  });

  it("reactivates error mapping on structural update and clears lastError", () => {
    const mapping = createActive();
    mapping.markError("sync failed");
    mapping.updateInternalMapping(
      {
        propertyId: PROPERTY_ID,
        unitId: "550e8400-e29b-41d4-a716-446655440099",
      },
      new Date("2027-01-01T07:00:00.000Z"),
    );

    expect(mapping.status).toBe("active");
    expect(mapping.lastError).toBeNull();
    expect(mapping.mappingVersion).toBe(2);
  });

  it("rejects empty external listing id on create", () => {
    expect(() => createActive({ externalListingId: "  " })).toThrow(ValidationError);
  });

  it("does not increment version when internal mapping values are unchanged", () => {
    const mapping = createActive();
    mapping.updateInternalMapping({ propertyId: PROPERTY_ID, unitId: UNIT_ID });

    expect(mapping.mappingVersion).toBe(1);
  });

  it("increments version when unit id changes", () => {
    const mapping = createActive();
    mapping.updateInternalMapping({
      propertyId: PROPERTY_ID,
      unitId: "550e8400-e29b-41d4-a716-446655440099",
    });

    expect(mapping.mappingVersion).toBe(2);
  });

  it("increments version when external unit id changes", () => {
    const mapping = createActive();
    mapping.updateExternalMapping({
      externalListingId: "listing-100",
      externalUnitId: "room-b",
    });

    expect(mapping.mappingVersion).toBe(2);
  });

  it("increments version when sync direction changes", () => {
    const mapping = createActive();
    mapping.updateSyncDirection("inbound");

    expect(mapping.syncDirection).toBe("inbound");
    expect(mapping.mappingVersion).toBe(2);
  });

  it("does not increment version on status-only changes", () => {
    const mapping = createActive();
    mapping.pause();
    mapping.resume();
    mapping.markUnmapped();
    mapping.markError("temporary");

    expect(mapping.mappingVersion).toBe(1);
  });

  it("increments version sequentially on multiple structural changes", () => {
    const mapping = createActive();
    mapping.updateInternalMapping({
      propertyId: PROPERTY_ID,
      unitId: "550e8400-e29b-41d4-a716-446655440099",
    });
    mapping.updateExternalMapping({
      externalListingId: "listing-200",
      externalUnitId: "room-b",
    });
    mapping.updateSyncDirection("outbound");

    expect(mapping.mappingVersion).toBe(4);
  });
});

describe("InMemoryChannelListingMappingRepository", () => {
  const repository = new InMemoryChannelListingMappingRepository();

  beforeEach(() => {
    repository.clear();
  });

  it("saves and finds a mapping by tenant and id", async () => {
    const mapping = createActive();
    await repository.save(mapping);

    const found = await repository.findById(TENANT_ID, MAPPING_ID);
    expect(found?.status).toBe("active");
    expect(found?.mappingVersion).toBe(1);
  });

  it("enforces tenant isolation on findById", async () => {
    await repository.save(createActive());
    const found = await repository.findById("other-tenant", MAPPING_ID);
    expect(found).toBeNull();
  });

  it("lists mappings for a connection", async () => {
    await repository.save(createActive());
    await repository.save(
      createActive({
        id: "550e8400-e29b-41d4-a716-446655440015",
        externalListingId: "listing-101",
      }),
    );
    await repository.save(
      createActive({
        id: "550e8400-e29b-41d4-a716-446655440016",
        tenantId: "550e8400-e29b-41d4-a716-446655440099",
        connectionId: "550e8400-e29b-41d4-a716-446655440099",
        externalListingId: "listing-other",
      }),
    );

    const listed = await repository.listByConnection(TENANT_ID, CONNECTION_ID);
    expect(listed).toHaveLength(2);
  });

  it("finds mapping by external listing and optional external unit", async () => {
    await repository.save(createActive());
    await repository.save(
      createActive({
        id: "550e8400-e29b-41d4-a716-446655440015",
        externalListingId: "listing-100",
        externalUnitId: null,
      }),
    );

    const withUnit = await repository.findByExternalListing(
      TENANT_ID,
      CONNECTION_ID,
      "listing-100",
      "room-a",
    );
    const withoutUnit = await repository.findByExternalListing(
      TENANT_ID,
      CONNECTION_ID,
      "listing-100",
      null,
    );

    expect(withUnit?.id).toBe(MAPPING_ID);
    expect(withoutUnit?.id).toBe("550e8400-e29b-41d4-a716-446655440015");
  });

  it("rejects duplicate external listing keys on save", async () => {
    await repository.save(createActive());
    const duplicate = createActive({ id: "550e8400-e29b-41d4-a716-446655440017" });

    await expect(repository.save(duplicate)).rejects.toThrow(ConflictError);
  });
});
