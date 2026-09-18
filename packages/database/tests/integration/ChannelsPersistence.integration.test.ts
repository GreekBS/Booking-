import { describe, it, expect, beforeEach, afterAll } from "vitest";
import {
  ChannelConnection,
  CredentialReference,
  ChannelListingMapping,
  ExternalReservationLink,
} from "@hcp/domain";
import {
  PrismaChannelConnectionRepository,
  PrismaChannelListingMappingRepository,
  PrismaExternalReservationLinkRepository,
} from "../../src";
import { prisma } from "./helpers";
import { runIntegration } from "./integrationGate";


runIntegration("Channels persistence integration (CM-2a)", () => {
  const connectionRepository = new PrismaChannelConnectionRepository();
  const mappingRepository = new PrismaChannelListingMappingRepository();
  const linkRepository = new PrismaExternalReservationLinkRepository();

  const TENANT_A = "550e8400-e29b-41d4-a716-446655440040";
  const TENANT_B = "550e8400-e29b-41d4-a716-446655440041";

  const CONNECTION_ID = "550e8400-e29b-41d4-a716-446655440042";
  const CONNECTION_ID_B = "550e8400-e29b-41d4-a716-446655440043";

  const MAPPING_ID_A = "550e8400-e29b-41d4-a716-446655440044";
  const MAPPING_ID_B = "550e8400-e29b-41d4-a716-446655440045";
  const MAPPING_ID_ROUNDTRIP_LINK = "550e8400-e29b-41d4-a716-446655440060";
  const MAPPING_ID_UQ_LINK = "550e8400-e29b-41d4-a716-446655440061";
  const MAPPING_ID_TENANT_A = "550e8400-e29b-41d4-a716-446655440062";
  const MAPPING_ID_TENANT_B = "550e8400-e29b-41d4-a716-446655440063";

  const PROPERTY_ID = "550e8400-e29b-41d4-a716-446655440046";
  const UNIT_ID = "550e8400-e29b-41d4-a716-446655440047";

  const EXTERNAL_LISTING_ID = "fake-listing-100";
  const EXTERNAL_UNIT_ID = "fake-room-a";
  const EXTERNAL_UNIT_ID_2 = "fake-room-b";

  const BOOKING_ID = "550e8400-e29b-41d4-a716-446655449001";

  const EXTERNAL_RESERVATION_ID = "fake-res-001";

  function expectNearDates(a: Date, b: Date, toleranceMs = 1_000): void {
    expect(Math.abs(a.getTime() - b.getTime())).toBeLessThanOrEqual(toleranceMs);
  }

  beforeEach(async () => {
    // Only truncate CM-2a tables to avoid cross-suite FK interactions.
    await prisma.externalReservationLink.deleteMany();
    await prisma.channelListingMapping.deleteMany();
    await prisma.channelConnection.deleteMany();

    // P1-S6a: every mapping save locks channel_connections FOR UPDATE first.
    // Seed parent connections so mapping persistence tests remain valid.
    async function seedConnection(tenantId: string, connectionId: string): Promise<void> {
      const connection = ChannelConnection.createDraft({
        id: connectionId,
        tenantId,
        provider: "booking_com",
        displayName: "Channel Connection",
      });
      connection.attachCredentials(CredentialReference.create("cred_fake_001"));
      connection.activate();
      await connectionRepository.create(connection);
    }

    await seedConnection(TENANT_A, CONNECTION_ID);
    await seedConnection(TENANT_B, CONNECTION_ID_B);
  });

  afterAll(async () => {
    await prisma.externalReservationLink.deleteMany();
    await prisma.channelListingMapping.deleteMany();
    await prisma.channelConnection.deleteMany();
    await prisma.$disconnect();
  });

  it("round-trips ChannelConnection", async () => {
    const found = await connectionRepository.findById(TENANT_A, CONNECTION_ID);
    expect(found).not.toBeNull();

    const foundProps = found!.toProps();

    expect(foundProps.tenantId).toBe(TENANT_A);
    expect(foundProps.id).toBe(CONNECTION_ID);
    expect(foundProps.provider).toBe("booking_com");
    expect(foundProps.displayName).toBe("Channel Connection");
    expect(foundProps.status).toBe("active");
    expect(foundProps.credentialRef).toBe("cred_fake_001");
    expect(foundProps.webhookVerificationRef).toBeNull();
    expect(foundProps.lastError).toBeNull();
    expect(foundProps.semanticMode).toBe("mixed_or_unknown_feed");
    expect(foundProps.semanticConfigVersion).toBe(1);
  });

  it("round-trips ChannelListingMapping and supports findByExternalListing", async () => {
    const mapping = ChannelListingMapping.createActive({
      id: MAPPING_ID_A,
      tenantId: TENANT_A,
      connectionId: CONNECTION_ID,
      externalListingId: EXTERNAL_LISTING_ID,
      externalUnitId: EXTERNAL_UNIT_ID,
      propertyId: PROPERTY_ID,
      unitId: UNIT_ID,
      syncDirection: "bidirectional",
    });

    await mappingRepository.save(mapping);

    const found = await mappingRepository.findById(TENANT_A, MAPPING_ID_A);
    expect(found).not.toBeNull();

    const expectedProps = mapping.toProps();
    const foundProps = found!.toProps();

    expect(foundProps.tenantId).toBe(expectedProps.tenantId);
    expect(foundProps.id).toBe(expectedProps.id);
    expect(foundProps.connectionId).toBe(expectedProps.connectionId);
    expect(foundProps.externalListingId).toBe(expectedProps.externalListingId);
    expect(foundProps.externalUnitId).toBe(expectedProps.externalUnitId);
    expect(foundProps.propertyId).toBe(expectedProps.propertyId);
    expect(foundProps.unitId).toBe(expectedProps.unitId);
    expect(foundProps.syncDirection).toBe(expectedProps.syncDirection);
    expect(foundProps.status).toBe(expectedProps.status);
    expect(foundProps.mappingVersion).toBe(expectedProps.mappingVersion);
    expect(foundProps.lastError).toBe(expectedProps.lastError);
    expectNearDates(foundProps.createdAt, expectedProps.createdAt);
    expectNearDates(foundProps.updatedAt, expectedProps.updatedAt);

    const byExternal = await mappingRepository.findByExternalListing(
      TENANT_A,
      CONNECTION_ID,
      EXTERNAL_LISTING_ID,
      EXTERNAL_UNIT_ID,
    );
    expect(byExternal?.id).toBe(MAPPING_ID_A);
  });

  it("round-trips ExternalReservationLink (FK: mapping_id -> channel_listing_mappings)", async () => {
    const mapping = await mappingRepository.findById(TENANT_A, MAPPING_ID_ROUNDTRIP_LINK);
    if (!mapping) {
      await mappingRepository.save(
        ChannelListingMapping.createActive({
          id: MAPPING_ID_ROUNDTRIP_LINK,
          tenantId: TENANT_A,
          connectionId: CONNECTION_ID,
          externalListingId: EXTERNAL_LISTING_ID,
          externalUnitId: EXTERNAL_UNIT_ID,
          propertyId: PROPERTY_ID,
          unitId: UNIT_ID,
          syncDirection: "bidirectional",
        }),
      );
    }

    const link = ExternalReservationLink.createLink({
      id: "550e8400-e29b-41d4-a716-446655440048",
      tenantId: TENANT_A,
      provider: "booking_com",
      connectionId: CONNECTION_ID,
      externalReservationId: EXTERNAL_RESERVATION_ID,
      bookingId: BOOKING_ID,
      mappingId: MAPPING_ID_ROUNDTRIP_LINK,
      mappingVersion: 1,
      externalRevision: "fake-rev-1",
      lastExternalUpdateAt: "2027-01-01T00:00:00Z",
    });

    await linkRepository.save(link);

    const found = await linkRepository.findByExternalReservation(
      TENANT_A,
      CONNECTION_ID,
      EXTERNAL_RESERVATION_ID,
    );
    expect(found).not.toBeNull();

    const expectedProps = link.toProps();
    const foundProps = found!.toProps();

    expect(foundProps.tenantId).toBe(expectedProps.tenantId);
    expect(foundProps.id).toBe(expectedProps.id);
    expect(foundProps.provider).toBe(expectedProps.provider);
    expect(foundProps.connectionId).toBe(expectedProps.connectionId);
    expect(foundProps.externalReservationId).toBe(expectedProps.externalReservationId);
    expect(foundProps.bookingId).toBe(expectedProps.bookingId);
    expect(foundProps.mappingId).toBe(expectedProps.mappingId);
    expect(foundProps.mappingVersionAtImport).toBe(expectedProps.mappingVersionAtImport);
    expect(foundProps.mappingVersionAtLastSync).toBe(expectedProps.mappingVersionAtLastSync);
    expect(foundProps.externalRevision).toBe(expectedProps.externalRevision);
    expect(foundProps.status).toBe(expectedProps.status);
    expect(foundProps.conflictReason).toBe(expectedProps.conflictReason);
    expectNearDates(foundProps.importedAt, expectedProps.importedAt);
    expect(foundProps.lastSyncedAt?.toISOString()).toBe(expectedProps.lastSyncedAt?.toISOString());
    expect(foundProps.lastExternalUpdateAt).toBe(expectedProps.lastExternalUpdateAt);
    expect(foundProps.archivedAt?.toISOString()).toBe(expectedProps.archivedAt?.toISOString());
    expectNearDates(foundProps.createdAt, expectedProps.createdAt);
    expectNearDates(foundProps.updatedAt, expectedProps.updatedAt);
  });

  it("enforces uniqueness of ChannelListingMapping (non-null externalUnitId)", async () => {
    const externalListingId = `${EXTERNAL_LISTING_ID}-uq-non-null`;
    const externalUnitId = `${EXTERNAL_UNIT_ID}-uq-non-null`;

    const mapping1 = ChannelListingMapping.createActive({
      id: "550e8400-e29b-41d4-a716-446655440049",
      tenantId: TENANT_A,
      connectionId: CONNECTION_ID,
      externalListingId,
      externalUnitId,
      propertyId: PROPERTY_ID,
      unitId: UNIT_ID,
      syncDirection: "bidirectional",
    });

    await mappingRepository.save(mapping1);

    const mapping2 = ChannelListingMapping.createActive({
      id: "550e8400-e29b-41d4-a716-446655440050",
      tenantId: TENANT_A,
      connectionId: CONNECTION_ID,
      externalListingId,
      externalUnitId,
      propertyId: PROPERTY_ID,
      unitId: UNIT_ID,
      syncDirection: "bidirectional",
    });

    await expect(mappingRepository.save(mapping2)).rejects.toMatchObject({ code: "P2002" });
  });

  it("enforces uniqueness of ChannelListingMapping when externalUnitId is NULL", async () => {
    const externalListingId = `${EXTERNAL_LISTING_ID}-uq-null`;

    const mapping1 = ChannelListingMapping.createActive({
      id: "550e8400-e29b-41d4-a716-446655440051",
      tenantId: TENANT_A,
      connectionId: CONNECTION_ID,
      externalListingId,
      externalUnitId: null,
      propertyId: PROPERTY_ID,
      unitId: UNIT_ID,
      syncDirection: "bidirectional",
    });

    await mappingRepository.save(mapping1);

    const mapping2 = ChannelListingMapping.createActive({
      id: "550e8400-e29b-41d4-a716-446655440052",
      tenantId: TENANT_A,
      connectionId: CONNECTION_ID,
      externalListingId,
      externalUnitId: null,
      propertyId: PROPERTY_ID,
      unitId: UNIT_ID,
      syncDirection: "bidirectional",
    });

    await expect(mappingRepository.save(mapping2)).rejects.toMatchObject({ code: "P2002" });
  });

  it("enforces uniqueness of ExternalReservationLink by (tenantId, connectionId, externalReservationId)", async () => {
    // Ensure mapping exists for the FK
    await mappingRepository.save(
      ChannelListingMapping.createActive({
        id: MAPPING_ID_UQ_LINK,
        tenantId: TENANT_A,
        connectionId: CONNECTION_ID,
        externalListingId: `${EXTERNAL_LISTING_ID}-uq-link`,
        externalUnitId: EXTERNAL_UNIT_ID_2,
        propertyId: PROPERTY_ID,
        unitId: UNIT_ID,
        syncDirection: "bidirectional",
      }),
    );

    const link1 = ExternalReservationLink.createLink({
      id: "550e8400-e29b-41d4-a716-446655440053",
      tenantId: TENANT_A,
      provider: "booking_com",
      connectionId: CONNECTION_ID,
      externalReservationId: EXTERNAL_RESERVATION_ID,
      bookingId: BOOKING_ID,
      mappingId: MAPPING_ID_UQ_LINK,
      mappingVersion: 1,
      externalRevision: "fake-rev-1",
      lastExternalUpdateAt: "2027-01-01T00:00:00Z",
    });

    await linkRepository.save(link1);

    const link2 = ExternalReservationLink.createLink({
      id: "550e8400-e29b-41d4-a716-446655440054",
      tenantId: TENANT_A,
      provider: "booking_com",
      connectionId: CONNECTION_ID,
      externalReservationId: EXTERNAL_RESERVATION_ID,
      bookingId: "550e8400-e29b-41d4-a716-446655449002",
      mappingId: MAPPING_ID_UQ_LINK,
      mappingVersion: 1,
      externalRevision: "fake-rev-1",
      lastExternalUpdateAt: "2027-01-01T00:00:00Z",
    });

    await expect(linkRepository.save(link2)).rejects.toMatchObject({ code: "P2002" });

    const links = await linkRepository.listByConnection(TENANT_A, CONNECTION_ID);
    expect(links).toHaveLength(1);
  });

  it("enforces tenant isolation (no cross-tenant reads)", async () => {
    // tenant A mapping + link
    await mappingRepository.save(
      ChannelListingMapping.createActive({
        id: MAPPING_ID_TENANT_A,
        tenantId: TENANT_A,
        connectionId: CONNECTION_ID,
        externalListingId: `${EXTERNAL_LISTING_ID}-a`,
        externalUnitId: EXTERNAL_UNIT_ID,
        propertyId: PROPERTY_ID,
        unitId: UNIT_ID,
        syncDirection: "bidirectional",
      }),
    );

    const linkA = ExternalReservationLink.createLink({
      id: "550e8400-e29b-41d4-a716-446655440055",
      tenantId: TENANT_A,
      provider: "booking_com",
      connectionId: CONNECTION_ID,
      externalReservationId: `${EXTERNAL_RESERVATION_ID}-a`,
      bookingId: `${BOOKING_ID}-a`,
      mappingId: MAPPING_ID_TENANT_A,
      mappingVersion: 1,
      externalRevision: null,
      lastExternalUpdateAt: null,
    });

    await linkRepository.save(linkA);

    // tenant B mapping + link
    await mappingRepository.save(
      ChannelListingMapping.createActive({
        id: MAPPING_ID_TENANT_B,
        tenantId: TENANT_B,
        connectionId: CONNECTION_ID_B,
        externalListingId: `${EXTERNAL_LISTING_ID}-b`,
        externalUnitId: EXTERNAL_UNIT_ID,
        propertyId: PROPERTY_ID,
        unitId: UNIT_ID,
        syncDirection: "bidirectional",
      }),
    );

    const linkB = ExternalReservationLink.createLink({
      id: "550e8400-e29b-41d4-a716-446655440056",
      tenantId: TENANT_B,
      provider: "booking_com",
      connectionId: CONNECTION_ID_B,
      externalReservationId: `${EXTERNAL_RESERVATION_ID}-b`,
      bookingId: `${BOOKING_ID}-b`,
      mappingId: MAPPING_ID_TENANT_B,
      mappingVersion: 1,
      externalRevision: null,
      lastExternalUpdateAt: null,
    });

    await linkRepository.save(linkB);

    // Read tenant A only
    const linksA = await linkRepository.listByConnection(TENANT_A, CONNECTION_ID);
    expect(linksA.map((l) => l.externalReservationId)).toEqual([`${EXTERNAL_RESERVATION_ID}-a`]);

    // Read tenant B only
    const linksB = await linkRepository.listByConnection(TENANT_B, CONNECTION_ID_B);
    expect(linksB.map((l) => l.externalReservationId)).toEqual([`${EXTERNAL_RESERVATION_ID}-b`]);
  });
});

