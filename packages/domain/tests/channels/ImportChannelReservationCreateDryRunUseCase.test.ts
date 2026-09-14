import { describe, it, expect, beforeEach, vi } from "vitest";
import { ChannelProviderRegistry } from "../../src/channels/providers/ChannelProviderRegistry";
import { InMemoryChannelConnectionRepository } from "../../src/channels/repositories/InMemoryChannelConnectionRepository";
import { InMemoryChannelListingMappingRepository } from "../../src/channels/repositories/InMemoryChannelListingMappingRepository";
import { InMemoryExternalReservationLinkRepository } from "../../src/channels/repositories/InMemoryExternalReservationLinkRepository";
import {
  seedActiveConnection,
  seedActiveMapping,
} from "./fixtures/channelImportSeed";
import { createFakeChannelProviderRegistration } from "../../src/channels/simulation/FakeChannelProviderBundle";
import {
  FakeChannelReservationImportProvider,
  FAKE_CHANNEL_PROVIDER_ID,
} from "../../src/channels/simulation/FakeChannelReservationImportProvider";
import {
  buildSimulatedProviderMessage,
  DEFAULT_SIMULATED_FIXTURE,
} from "../../src/channels/simulation/SimulatedReservationFixtures";
import { ChannelConnection } from "../../src/channels/domain/ChannelConnection";
import { CredentialReference } from "../../src/channels/domain/value-objects/CredentialReference";
import { ExternalReservationLink } from "../../src/channels/domain/ExternalReservationLink";
import { ImportChannelReservationCreateDryRunUseCase } from "../../src/channels/application/ImportChannelReservationCreateDryRunUseCase";
import type { IChannelReservationImportProvider } from "../../src/channels/ports/providers/IChannelReservationImportProvider";
import type { ChannelReservationImportMapping } from "../../src/channels/types/ChannelReservationImportMapping";

const TENANT_ID = "550e8400-e29b-41d4-a716-446655440040";
const CONNECTION_ID = "550e8400-e29b-41d4-a716-446655440041";
const MAPPING_ID = "550e8400-e29b-41d4-a716-446655440042";
const LINK_ID = "550e8400-e29b-41d4-a716-446655440043";
const PROPERTY_ID = "550e8400-e29b-41d4-a716-446655440044";
const UNIT_ID = "550e8400-e29b-41d4-a716-446655440045";
const BOOKING_ID = "550e8400-e29b-41d4-a716-446655440050";

describe("ImportChannelReservationCreateDryRunUseCase", () => {
  let registry: ChannelProviderRegistry;
  let connectionRepository: InMemoryChannelConnectionRepository;
  let mappingRepository: InMemoryChannelListingMappingRepository;
  let linkRepository: InMemoryExternalReservationLinkRepository;
  let importProvider: FakeChannelReservationImportProvider;
  let mapMessageSpy: ReturnType<typeof vi.spyOn>;
  let saveLinkSpy: ReturnType<typeof vi.spyOn>;
  let useCase: ImportChannelReservationCreateDryRunUseCase;

  beforeEach(() => {
    registry = new ChannelProviderRegistry();
    connectionRepository = new InMemoryChannelConnectionRepository();
    mappingRepository = new InMemoryChannelListingMappingRepository();
    linkRepository = new InMemoryExternalReservationLinkRepository();
    importProvider = new FakeChannelReservationImportProvider();
    mapMessageSpy = vi.spyOn(importProvider, "mapMessage");
    saveLinkSpy = vi.spyOn(linkRepository, "save");

    const reservationImport: IChannelReservationImportProvider = {
      mapMessage: (message, context) => importProvider.mapMessage(message, context),
    };
    registry.register({
      ...createFakeChannelProviderRegistration(),
      reservationImport,
    });

    useCase = new ImportChannelReservationCreateDryRunUseCase(
      registry,
      connectionRepository,
      mappingRepository,
      linkRepository,
    );
  });

  function buildMessage() {
    return buildSimulatedProviderMessage({
      messageId: "msg-fake-001",
      connectionId: CONNECTION_ID,
      provider: FAKE_CHANNEL_PROVIDER_ID,
      externalListingId: "fake-listing-100",
      externalUnitId: "fake-room-a",
      externalReservationId: "fake-res-001",
      payload: DEFAULT_SIMULATED_FIXTURE,
    });
  }

  async function seedScenario() {
    await seedActiveConnection(connectionRepository, {
      id: CONNECTION_ID,
      tenantId: TENANT_ID,
      provider: FAKE_CHANNEL_PROVIDER_ID,
    });
    await seedActiveMapping(mappingRepository, {
      id: MAPPING_ID,
      tenantId: TENANT_ID,
      connectionId: CONNECTION_ID,
      externalListingId: "fake-listing-100",
      externalUnitId: "fake-room-a",
      propertyId: PROPERTY_ID,
      unitId: UNIT_ID,
    });
  }

  it("returns normalized command and mapping context without persisting a link", async () => {
    await seedScenario();

    const result = await useCase.execute({
      tenantId: TENANT_ID,
      connectionId: CONNECTION_ID,
      provider: FAKE_CHANNEL_PROVIDER_ID,
      message: buildMessage(),
    });

    expect(result.isSuccess).toBe(true);
    const value = result.getValue();
    expect(value.duplicate).toBe(false);
    if (value.duplicate) {
      throw new Error("Expected non-duplicate dry-run result");
    }

    expect(value.mappingVersionUsed).toBe(1);
    expect(value.mappingContext).toEqual({
      mappingId: MAPPING_ID,
      mappingVersion: 1,
      propertyId: PROPERTY_ID,
      unitId: UNIT_ID,
      connectionId: CONNECTION_ID,
    });
    expect(value.command).toMatchObject({
      tenantId: TENANT_ID,
      propertyId: PROPERTY_ID,
      unitId: UNIT_ID,
      checkIn: "2027-08-01",
      checkOut: "2027-08-05",
      guestCount: 2,
      source: "booking_com",
      externalReference: { source: "booking_com", externalId: "fake-res-001" },
    });
    expect(JSON.stringify(buildMessage().payload)).not.toContain(PROPERTY_ID);
    expect(JSON.stringify(buildMessage().payload)).not.toContain(UNIT_ID);
    expect(saveLinkSpy).not.toHaveBeenCalled();
    expect(await linkRepository.listByConnection(TENANT_ID, CONNECTION_ID)).toHaveLength(0);
  });

  it("passes mapping-derived context to the provider import contract", async () => {
    await seedScenario();

    await useCase.execute({
      tenantId: TENANT_ID,
      connectionId: CONNECTION_ID,
      provider: FAKE_CHANNEL_PROVIDER_ID,
      message: buildMessage(),
    });

    expect(mapMessageSpy).toHaveBeenCalledWith(buildMessage(), {
      tenantId: TENANT_ID,
      connectionId: CONNECTION_ID,
      propertyId: PROPERTY_ID,
      unitId: UNIT_ID,
    });
  });

  it("returns duplicate result when a link already exists and does not call the provider", async () => {
    await seedScenario();

    const existingLink = ExternalReservationLink.createLink({
      id: LINK_ID,
      tenantId: TENANT_ID,
      provider: FAKE_CHANNEL_PROVIDER_ID,
      connectionId: CONNECTION_ID,
      externalReservationId: "fake-res-001",
      bookingId: BOOKING_ID,
      mappingId: MAPPING_ID,
      mappingVersion: 1,
    });
    await linkRepository.save(existingLink);
    mapMessageSpy.mockClear();
    saveLinkSpy.mockClear();

    const result = await useCase.execute({
      tenantId: TENANT_ID,
      connectionId: CONNECTION_ID,
      provider: FAKE_CHANNEL_PROVIDER_ID,
      message: buildMessage(),
    });

    expect(result.isSuccess).toBe(true);
    const value = result.getValue();
    expect(value.duplicate).toBe(true);
    if (!value.duplicate) {
      throw new Error("Expected duplicate dry-run result");
    }

    expect(value.command).toBeNull();
    expect(value.existingLink.id).toBe(LINK_ID);
    expect(value.mappingVersionUsed).toBe(1);
    expect(mapMessageSpy).not.toHaveBeenCalled();
    expect(saveLinkSpy).not.toHaveBeenCalled();
  });

  it("fails when provider import capability is missing", async () => {
    await seedScenario();

    const result = await useCase.execute({
      tenantId: TENANT_ID,
      connectionId: CONNECTION_ID,
      provider: "airbnb",
      message: buildMessage(),
    });

    expect(result.isFailure).toBe(true);
    expect(result.getError().message).toContain("does not support reservation import");
    expect(mapMessageSpy).not.toHaveBeenCalled();
    expect(saveLinkSpy).not.toHaveBeenCalled();
  });

  it("fails when connection is missing or inactive", async () => {
    await seedActiveMapping(mappingRepository, {
      id: MAPPING_ID,
      tenantId: TENANT_ID,
      connectionId: CONNECTION_ID,
      externalListingId: "fake-listing-100",
      externalUnitId: "fake-room-a",
      propertyId: PROPERTY_ID,
      unitId: UNIT_ID,
    });

    const missingConnection = await useCase.execute({
      tenantId: TENANT_ID,
      connectionId: CONNECTION_ID,
      provider: FAKE_CHANNEL_PROVIDER_ID,
      message: buildMessage(),
    });
    expect(missingConnection.isFailure).toBe(true);
    expect(missingConnection.getError().message).toBe("Connection not found");

    const draft = ChannelConnection.createDraft({
      id: CONNECTION_ID,
      tenantId: TENANT_ID,
      provider: FAKE_CHANNEL_PROVIDER_ID,
      displayName: "Draft",
    });
    draft.attachCredentials(CredentialReference.create("cred_fake_002"));
    await connectionRepository.create(draft);

    const inactiveConnection = await useCase.execute({
      tenantId: TENANT_ID,
      connectionId: CONNECTION_ID,
      provider: FAKE_CHANNEL_PROVIDER_ID,
      message: buildMessage(),
    });
    expect(inactiveConnection.isFailure).toBe(true);
    expect(inactiveConnection.getError().message).toBe("Connection is not active");
    expect(saveLinkSpy).not.toHaveBeenCalled();
  });

  it("fails when listing mapping is missing or inactive", async () => {
    await seedActiveConnection(connectionRepository, {
      id: CONNECTION_ID,
      tenantId: TENANT_ID,
      provider: FAKE_CHANNEL_PROVIDER_ID,
    });

    const missingMapping = await useCase.execute({
      tenantId: TENANT_ID,
      connectionId: CONNECTION_ID,
      provider: FAKE_CHANNEL_PROVIDER_ID,
      message: buildMessage(),
    });
    expect(missingMapping.isFailure).toBe(true);
    expect(missingMapping.getError().message).toBe("Listing mapping not found");

    const mapping = await seedActiveMapping(mappingRepository, {
      id: MAPPING_ID,
      tenantId: TENANT_ID,
      connectionId: CONNECTION_ID,
      externalListingId: "fake-listing-100",
      externalUnitId: "fake-room-a",
      propertyId: PROPERTY_ID,
      unitId: UNIT_ID,
    });
    mapping.pause();
    await mappingRepository.save(mapping);

    const inactiveMapping = await useCase.execute({
      tenantId: TENANT_ID,
      connectionId: CONNECTION_ID,
      provider: FAKE_CHANNEL_PROVIDER_ID,
      message: buildMessage(),
    });
    expect(inactiveMapping.isFailure).toBe(true);
    expect(inactiveMapping.getError().message).toBe("Listing mapping is not active");
    expect(saveLinkSpy).not.toHaveBeenCalled();
  });

  it("rejects non-create provider mappings", async () => {
    await seedScenario();

    const reservationImport: IChannelReservationImportProvider = {
      mapMessage: async (): Promise<ChannelReservationImportMapping> => ({
        kind: "modify",
        mapping: {
          externalReference: { source: "booking_com", externalId: "fake-res-001" },
          connectionId: CONNECTION_ID,
          proposed: {
            unitId: UNIT_ID,
            checkIn: "2027-08-01",
            checkOut: "2027-08-05",
            guestCount: 2,
          },
          idempotencyKey: "modify-key",
        },
      }),
    };
    registry.register({
      ...createFakeChannelProviderRegistration(),
      providerId: "expedia",
      reservationImport,
    });

    const result = await useCase.execute({
      tenantId: TENANT_ID,
      connectionId: CONNECTION_ID,
      provider: "expedia",
      message: buildMessage(),
    });

    expect(result.isFailure).toBe(true);
    expect(result.getError().message).toBe("Only reservation create imports are supported");
    expect(saveLinkSpy).not.toHaveBeenCalled();
  });

  it("fails when normalized command does not match resolved mapping", async () => {
    await seedScenario();

    const reservationImport: IChannelReservationImportProvider = {
      mapMessage: async (): Promise<ChannelReservationImportMapping> => ({
        kind: "create",
        command: {
          tenantId: TENANT_ID,
          propertyId: "wrong-property",
          unitId: UNIT_ID,
          checkIn: "2027-08-01",
          checkOut: "2027-08-05",
          guestCount: 2,
          guest: { name: "Guest", email: "guest@example.com", phone: null },
          source: "booking_com",
          externalReference: { source: "booking_com", externalId: "fake-res-001" },
        },
      }),
    };
    registry.register({
      ...createFakeChannelProviderRegistration(),
      providerId: "expedia",
      reservationImport,
    });

    const result = await useCase.execute({
      tenantId: TENANT_ID,
      connectionId: CONNECTION_ID,
      provider: "expedia",
      message: buildMessage(),
    });

    expect(result.isFailure).toBe(true);
    expect(result.getError().message).toBe(
      "Normalized command does not match resolved mapping",
    );
    expect(saveLinkSpy).not.toHaveBeenCalled();
  });
});
