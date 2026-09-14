import { describe, it, expect, beforeEach } from "vitest";
import { ChannelProviderRegistry } from "../../src/channels/providers/ChannelProviderRegistry";
import { InMemoryChannelConnectionRepository } from "../../src/channels/repositories/InMemoryChannelConnectionRepository";
import { InMemoryChannelListingMappingRepository } from "../../src/channels/repositories/InMemoryChannelListingMappingRepository";
import { InMemoryExternalReservationLinkRepository } from "../../src/channels/repositories/InMemoryExternalReservationLinkRepository";
import {
  ChannelImportSimulation,
} from "../../src/channels/simulation/ChannelImportSimulation";
import {
  seedActiveConnection,
  seedActiveMapping,
} from "./fixtures/channelImportSeed";
import { createFakeChannelProviderRegistration } from "../../src/channels/simulation/FakeChannelProviderBundle";
import { FAKE_CHANNEL_PROVIDER_ID } from "../../src/channels/simulation/FakeChannelReservationImportProvider";
import { ChannelImportSimulationError } from "../../src/channels/simulation/ChannelImportSimulationError";
import {
  buildSimulatedProviderMessage,
  DEFAULT_SIMULATED_FIXTURE,
  SIMULATED_BOOKING_ID,
} from "../../src/channels/simulation/SimulatedReservationFixtures";
import { ChannelConnection } from "../../src/channels/domain/ChannelConnection";
import { CredentialReference } from "../../src/channels/domain/value-objects/CredentialReference";

const TENANT_ID = "550e8400-e29b-41d4-a716-446655440040";
const CONNECTION_ID = "550e8400-e29b-41d4-a716-446655440041";
const MAPPING_ID = "550e8400-e29b-41d4-a716-446655440042";
const LINK_ID = "550e8400-e29b-41d4-a716-446655440043";
const PROPERTY_ID = "550e8400-e29b-41d4-a716-446655440044";
const UNIT_ID = "550e8400-e29b-41d4-a716-446655440045";

describe("ChannelImportSimulation", () => {
  let registry: ChannelProviderRegistry;
  let connectionRepository: InMemoryChannelConnectionRepository;
  let mappingRepository: InMemoryChannelListingMappingRepository;
  let linkRepository: InMemoryExternalReservationLinkRepository;
  let simulation: ChannelImportSimulation;

  beforeEach(() => {
    registry = new ChannelProviderRegistry();
    connectionRepository = new InMemoryChannelConnectionRepository();
    mappingRepository = new InMemoryChannelListingMappingRepository();
    linkRepository = new InMemoryExternalReservationLinkRepository();
    simulation = new ChannelImportSimulation(
      registry,
      connectionRepository,
      mappingRepository,
      linkRepository,
    );
    registry.register(createFakeChannelProviderRegistration());
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

  it("runs end-to-end import simulation and stops at normalized command", async () => {
    await seedScenario();

    const result = await simulation.simulateImport({
      tenantId: TENANT_ID,
      provider: FAKE_CHANNEL_PROVIDER_ID,
      connectionId: CONNECTION_ID,
      message: buildMessage(),
      linkId: LINK_ID,
    });

    expect(result.duplicate).toBe(false);
    expect(result.mappingVersionUsed).toBe(1);
    expect(result.command).toMatchObject({
      tenantId: TENANT_ID,
      propertyId: PROPERTY_ID,
      unitId: UNIT_ID,
      checkIn: "2027-08-01",
      checkOut: "2027-08-05",
      guestCount: 2,
      source: "booking_com",
      externalReference: { source: "booking_com", externalId: "fake-res-001" },
    });
    expect(result.link.status).toBe("linked");
    expect(result.link.bookingId).toBe(SIMULATED_BOOKING_ID);
    expect(result.link.mappingVersionAtImport).toBe(1);
    expect(JSON.stringify(buildMessage().payload)).not.toContain(PROPERTY_ID);
    expect(JSON.stringify(buildMessage().payload)).not.toContain(UNIT_ID);
  });

  it("registers fake provider import capability in the registry", () => {
    expect(registry.resolveReservationImport(FAKE_CHANNEL_PROVIDER_ID)).not.toBeNull();
    expect(registry.resolveReservationExport(FAKE_CHANNEL_PROVIDER_ID)).toBeNull();
  });

  it("requires an active connection", async () => {
    await seedActiveMapping(mappingRepository, {
      id: MAPPING_ID,
      tenantId: TENANT_ID,
      connectionId: CONNECTION_ID,
      externalListingId: "fake-listing-100",
      externalUnitId: "fake-room-a",
      propertyId: PROPERTY_ID,
      unitId: UNIT_ID,
    });

    await expect(
      simulation.simulateImport({
        tenantId: TENANT_ID,
        provider: FAKE_CHANNEL_PROVIDER_ID,
        connectionId: CONNECTION_ID,
        message: buildMessage(),
      }),
    ).rejects.toThrow(ChannelImportSimulationError);
  });

  it("requires an active listing mapping", async () => {
    await seedActiveConnection(connectionRepository, {
      id: CONNECTION_ID,
      tenantId: TENANT_ID,
      provider: FAKE_CHANNEL_PROVIDER_ID,
    });

    await expect(
      simulation.simulateImport({
        tenantId: TENANT_ID,
        provider: FAKE_CHANNEL_PROVIDER_ID,
        connectionId: CONNECTION_ID,
        message: buildMessage(),
      }),
    ).rejects.toThrow("Listing mapping not found");
  });

  it("rejects inactive listing mapping", async () => {
    await seedActiveConnection(connectionRepository, {
      id: CONNECTION_ID,
      tenantId: TENANT_ID,
      provider: FAKE_CHANNEL_PROVIDER_ID,
    });
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

    await expect(
      simulation.simulateImport({
        tenantId: TENANT_ID,
        provider: FAKE_CHANNEL_PROVIDER_ID,
        connectionId: CONNECTION_ID,
        message: buildMessage(),
      }),
    ).rejects.toThrow("Listing mapping is not active");
  });

  it("returns duplicate result for repeated external reservation id", async () => {
    await seedScenario();

    const first = await simulation.simulateImport({
      tenantId: TENANT_ID,
      provider: FAKE_CHANNEL_PROVIDER_ID,
      connectionId: CONNECTION_ID,
      message: buildMessage(),
      linkId: LINK_ID,
    });
    const second = await simulation.simulateImport({
      tenantId: TENANT_ID,
      provider: FAKE_CHANNEL_PROVIDER_ID,
      connectionId: CONNECTION_ID,
      message: buildMessage(),
      linkId: "550e8400-e29b-41d4-a716-446655440046",
    });

    expect(first.duplicate).toBe(false);
    expect(second.duplicate).toBe(true);
    expect(second.link.id).toBe(LINK_ID);
    expect(second.command).toBeNull();
    expect(await linkRepository.listByConnection(TENANT_ID, CONNECTION_ID)).toHaveLength(1);
  });

  it("freezes mapping version on link when mapping later changes", async () => {
    await seedScenario();

    const result = await simulation.simulateImport({
      tenantId: TENANT_ID,
      provider: FAKE_CHANNEL_PROVIDER_ID,
      connectionId: CONNECTION_ID,
      message: buildMessage(),
      linkId: LINK_ID,
    });

    const mapping = await mappingRepository.findById(TENANT_ID, MAPPING_ID);
    expect(mapping).not.toBeNull();
    mapping!.updateInternalMapping({
      propertyId: PROPERTY_ID,
      unitId: "550e8400-e29b-41d4-a716-446655440099",
    });
    await mappingRepository.save(mapping!);

    expect(result.link.mappingVersionAtImport).toBe(1);
    expect(mapping!.mappingVersion).toBe(2);
  });

  it("supports multiple links for the same simulated booking id", async () => {
    await seedScenario();
    await seedActiveMapping(mappingRepository, {
      id: "550e8400-e29b-41d4-a716-446655440047",
      tenantId: TENANT_ID,
      connectionId: "550e8400-e29b-41d4-a716-446655440048",
      externalListingId: "ical-listing-1",
      externalUnitId: null,
      propertyId: PROPERTY_ID,
      unitId: UNIT_ID,
    });
    await seedActiveConnection(connectionRepository, {
      id: "550e8400-e29b-41d4-a716-446655440048",
      tenantId: TENANT_ID,
      provider: "ical",
      displayName: "iCal Connection",
    });
    registry.register({
      ...createFakeChannelProviderRegistration(),
      providerId: "ical",
    });

    await simulation.simulateImport({
      tenantId: TENANT_ID,
      provider: FAKE_CHANNEL_PROVIDER_ID,
      connectionId: CONNECTION_ID,
      message: buildMessage(),
      linkId: LINK_ID,
    });
    await simulation.simulateImport({
      tenantId: TENANT_ID,
      provider: "ical",
      connectionId: "550e8400-e29b-41d4-a716-446655440048",
      message: buildSimulatedProviderMessage({
        messageId: "msg-ical-001",
        connectionId: "550e8400-e29b-41d4-a716-446655440048",
        provider: "ical",
        externalListingId: "ical-listing-1",
        externalReservationId: "ical-res-001",
        payload: DEFAULT_SIMULATED_FIXTURE,
      }),
      linkId: "550e8400-e29b-41d4-a716-446655440049",
    });

    const links = await linkRepository.listByBookingId(TENANT_ID, SIMULATED_BOOKING_ID);
    expect(links).toHaveLength(2);
  });

  it("does not expose credential or token material in simulation output", async () => {
    await seedScenario();
    const result = await simulation.simulateImport({
      tenantId: TENANT_ID,
      provider: FAKE_CHANNEL_PROVIDER_ID,
      connectionId: CONNECTION_ID,
      message: buildMessage(),
      linkId: LINK_ID,
    });

    const serialized = JSON.stringify(result);
    expect(serialized).not.toMatch(/token|secret|oauth|api_key/i);
    expect(serialized).not.toContain("cred_fake");
  });

  it("rejects disconnected connection", async () => {
    await seedScenario();
    const connection = await connectionRepository.findById(TENANT_ID, CONNECTION_ID);
    const priorStatus = connection!.status;
    const version = connection!.semanticConfigVersion;
    connection!.disconnect();
    await connectionRepository.disconnectWithExpectedSemanticVersion(
      connection!,
      version,
      priorStatus,
    );

    await expect(
      simulation.simulateImport({
        tenantId: TENANT_ID,
        provider: FAKE_CHANNEL_PROVIDER_ID,
        connectionId: CONNECTION_ID,
        message: buildMessage(),
      }),
    ).rejects.toThrow("Connection is not active");
  });

  it("rejects draft connection without activation", async () => {
    const draft = ChannelConnection.createDraft({
      id: CONNECTION_ID,
      tenantId: TENANT_ID,
      provider: FAKE_CHANNEL_PROVIDER_ID,
      displayName: "Draft",
    });
    draft.attachCredentials(CredentialReference.create("cred_fake_002"));
    await connectionRepository.create(draft);
    await seedActiveMapping(mappingRepository, {
      id: MAPPING_ID,
      tenantId: TENANT_ID,
      connectionId: CONNECTION_ID,
      externalListingId: "fake-listing-100",
      externalUnitId: "fake-room-a",
      propertyId: PROPERTY_ID,
      unitId: UNIT_ID,
    });

    await expect(
      simulation.simulateImport({
        tenantId: TENANT_ID,
        provider: FAKE_CHANNEL_PROVIDER_ID,
        connectionId: CONNECTION_ID,
        message: buildMessage(),
      }),
    ).rejects.toThrow("Connection is not active");
  });
});
