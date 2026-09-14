import { describe, it, expect, beforeEach } from "vitest";
import { ExternalReservationLink } from "../../src/channels/domain/ExternalReservationLink";
import { ConflictError, ValidationError } from "../../src/shared/errors/DomainError";
import { InMemoryExternalReservationLinkRepository } from "../../src/channels/repositories/InMemoryExternalReservationLinkRepository";

const TENANT_ID = "550e8400-e29b-41d4-a716-446655440020";
const CONNECTION_ID = "550e8400-e29b-41d4-a716-446655440021";
const LINK_ID = "550e8400-e29b-41d4-a716-446655440022";
const BOOKING_ID = "550e8400-e29b-41d4-a716-446655440023";
const MAPPING_ID = "550e8400-e29b-41d4-a716-446655440024";

function createLink(overrides: Partial<Parameters<typeof ExternalReservationLink.createLink>[0]> = {}) {
  return ExternalReservationLink.createLink({
    id: LINK_ID,
    tenantId: TENANT_ID,
    provider: "booking_com",
    connectionId: CONNECTION_ID,
    externalReservationId: "res-100",
    bookingId: BOOKING_ID,
    mappingId: MAPPING_ID,
    mappingVersion: 2,
    externalRevision: "rev-1",
    lastExternalUpdateAt: "2027-01-01T10:00:00.000Z",
    now: new Date("2027-01-01T00:00:00.000Z"),
    importedAt: new Date("2027-01-01T00:00:00.000Z"),
    ...overrides,
  });
}

describe("ExternalReservationLink", () => {
  it("creates a linked reservation with frozen import mapping version", () => {
    const link = createLink();

    expect(link.status).toBe("linked");
    expect(link.mappingVersionAtImport).toBe(2);
    expect(link.mappingVersionAtLastSync).toBe(2);
    expect(link.lastSyncedAt?.toISOString()).toBe("2027-01-01T00:00:00.000Z");
    expect(link.conflictReason).toBeNull();
  });

  it("marks synced from linked and updates sync metadata", () => {
    const link = createLink();
    link.markSynced(
      {
        mappingVersion: 4,
        externalRevision: "rev-2",
        lastExternalUpdateAt: "2027-01-02T10:00:00.000Z",
      },
      new Date("2027-01-02T00:00:00.000Z"),
    );

    expect(link.status).toBe("linked");
    expect(link.mappingVersionAtImport).toBe(2);
    expect(link.mappingVersionAtLastSync).toBe(4);
    expect(link.externalRevision).toBe("rev-2");
    expect(link.lastSyncedAt?.toISOString()).toBe("2027-01-02T00:00:00.000Z");
  });

  it("marks synced from stale and conflict", () => {
    const stale = createLink({ id: "550e8400-e29b-41d4-a716-446655440025" });
    stale.markStale();
    stale.markSynced({}, new Date("2027-01-03T00:00:00.000Z"));
    expect(stale.status).toBe("linked");

    const conflict = createLink({ id: "550e8400-e29b-41d4-a716-446655440026" });
    conflict.markConflict("mapping drift");
    conflict.markSynced({}, new Date("2027-01-04T00:00:00.000Z"));
    expect(conflict.status).toBe("linked");
    expect(conflict.conflictReason).toBeNull();
  });

  it("marks stale without changing mapping versions", () => {
    const link = createLink();
    link.markStale(new Date("2027-01-05T00:00:00.000Z"));

    expect(link.status).toBe("stale");
    expect(link.mappingVersionAtImport).toBe(2);
    expect(link.mappingVersionAtLastSync).toBe(2);
  });

  it("marks conflict with a safe reason", () => {
    const link = createLink();
    link.markConflict("concurrent modification");

    expect(link.status).toBe("conflict");
    expect(link.conflictReason).toBe("concurrent modification");
  });

  it("rejects markConflict from archived link", () => {
    const link = createLink();
    link.archive();
    expect(() => link.markConflict("too late")).toThrow(ConflictError);
  });

  it("archives a link and blocks further mutations", () => {
    const link = createLink();
    link.archive(new Date("2027-01-06T00:00:00.000Z"));

    expect(link.status).toBe("archived");
    expect(link.archivedAt?.toISOString()).toBe("2027-01-06T00:00:00.000Z");
    expect(() => link.markSynced()).toThrow(ConflictError);
  });

  it("updates external revision without changing mapping versions", () => {
    const link = createLink();
    link.updateExternalRevision(
      { revision: "rev-9", lastExternalUpdateAt: "2027-01-07T10:00:00.000Z" },
      new Date("2027-01-07T00:00:00.000Z"),
    );

    expect(link.externalRevision).toBe("rev-9");
    expect(link.lastExternalUpdateAt).toBe("2027-01-07T10:00:00.000Z");
    expect(link.mappingVersionAtImport).toBe(2);
    expect(link.mappingVersionAtLastSync).toBe(2);
  });

  it("updates mapping version at last sync only", () => {
    const link = createLink();
    link.updateMappingVersion(5, new Date("2027-01-08T00:00:00.000Z"));

    expect(link.mappingVersionAtImport).toBe(2);
    expect(link.mappingVersionAtLastSync).toBe(5);
  });

  it("rejects empty external reservation id on create", () => {
    expect(() => createLink({ externalReservationId: "  " })).toThrow(ValidationError);
  });

  it("does not store provider payloads in link props", () => {
    const link = createLink();
    const serialized = JSON.stringify(link.toProps());

    expect(serialized).not.toMatch(/webhook|payload|oauth/i);
    expect(serialized).toContain("res-100");
  });
});

describe("InMemoryExternalReservationLinkRepository", () => {
  const repository = new InMemoryExternalReservationLinkRepository();

  beforeEach(() => {
    repository.clear();
  });

  it("saves and finds a link by tenant and id", async () => {
    const link = createLink();
    await repository.save(link);

    const found = await repository.findById(TENANT_ID, LINK_ID);
    expect(found?.bookingId).toBe(BOOKING_ID);
    expect(found?.mappingVersionAtImport).toBe(2);
  });

  it("finds a link by external reservation", async () => {
    await repository.save(createLink());

    const found = await repository.findByExternalReservation(TENANT_ID, CONNECTION_ID, "res-100");
    expect(found?.id).toBe(LINK_ID);
  });

  it("lists multiple links for the same booking", async () => {
    await repository.save(createLink());
    await repository.save(
      createLink({
        id: "550e8400-e29b-41d4-a716-446655440027",
        provider: "ical",
        connectionId: "550e8400-e29b-41d4-a716-446655440028",
        externalReservationId: "ical-res-1",
      }),
    );

    const links = await repository.listByBookingId(TENANT_ID, BOOKING_ID);
    expect(links).toHaveLength(2);
  });

  it("finds the most recently synced link for a booking", async () => {
    const older = createLink({ id: "550e8400-e29b-41d4-a716-446655440028" });
    older.markSynced({}, new Date("2027-01-01T00:00:00.000Z"));
    await repository.save(older);

    const newer = createLink({
      id: "550e8400-e29b-41d4-a716-446655440029",
      provider: "ical",
      connectionId: "550e8400-e29b-41d4-a716-446655440030",
      externalReservationId: "ical-res-2",
    });
    newer.markSynced({}, new Date("2027-01-05T00:00:00.000Z"));
    await repository.save(newer);

    const found = await repository.findByBookingId(TENANT_ID, BOOKING_ID);
    expect(found?.id).toBe("550e8400-e29b-41d4-a716-446655440029");
  });

  it("returns null from findByBookingId when no links exist", async () => {
    const found = await repository.findByBookingId(TENANT_ID, BOOKING_ID);
    expect(found).toBeNull();
  });

  it("rejects duplicate external reservation keys", async () => {
    await repository.save(createLink());
    const duplicate = createLink({ id: "550e8400-e29b-41d4-a716-446655440031" });

    await expect(repository.save(duplicate)).rejects.toThrow(ConflictError);
  });

  it("enforces tenant isolation on findById", async () => {
    await repository.save(createLink());
    const found = await repository.findById("other-tenant", LINK_ID);
    expect(found).toBeNull();
  });

  it("lists links by connection", async () => {
    await repository.save(createLink());
    await repository.save(
      createLink({
        id: "550e8400-e29b-41d4-a716-446655440032",
        externalReservationId: "res-101",
      }),
    );
    await repository.save(
      createLink({
        id: "550e8400-e29b-41d4-a716-446655440033",
        connectionId: "550e8400-e29b-41d4-a716-446655440034",
        externalReservationId: "res-other",
      }),
    );

    const listed = await repository.listByConnection(TENANT_ID, CONNECTION_ID);
    expect(listed).toHaveLength(2);
  });
});
