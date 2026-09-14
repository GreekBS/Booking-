import { ChannelConnection } from "../domain/ChannelConnection";
import { ChannelListingMapping } from "../domain/ChannelListingMapping";
import { ExternalReservationLink } from "../domain/ExternalReservationLink";
import { CredentialReference } from "../domain/value-objects/CredentialReference";
import type { ChannelProviderMessage } from "../types/ChannelProviderMessage";
import type { ChannelSource } from "../types/ChannelSource";
import type { IChannelConnectionRepository } from "../ports/IChannelConnectionRepository";
import type { IChannelListingMappingRepository } from "../ports/IChannelListingMappingRepository";
import type { IExternalReservationLinkRepository } from "../ports/IExternalReservationLinkRepository";
import type { IChannelProviderRegistry } from "../ports/providers/IChannelProviderRegistry";
import { FakeChannelReservationImportProvider } from "./FakeChannelReservationImportProvider";
import { ChannelImportSimulationError } from "./ChannelImportSimulationError";
import type { ChannelImportSimulationResult } from "./ChannelImportSimulationResult";
import { SIMULATED_BOOKING_ID } from "./SimulatedReservationFixtures";

export interface ChannelImportSimulationInput {
  tenantId: string;
  provider: ChannelSource;
  connectionId: string;
  message: ChannelProviderMessage;
  simulatedBookingId?: string;
  linkId?: string;
}

export class ChannelImportSimulation {
  constructor(
    private readonly registry: IChannelProviderRegistry,
    private readonly connectionRepository: IChannelConnectionRepository,
    private readonly mappingRepository: IChannelListingMappingRepository,
    private readonly linkRepository: IExternalReservationLinkRepository,
    private readonly importProvider: FakeChannelReservationImportProvider = new FakeChannelReservationImportProvider(),
  ) {}

  async simulateImport(input: ChannelImportSimulationInput): Promise<ChannelImportSimulationResult> {
    const registration = this.registry.get(input.provider);
    if (!registration?.capabilities.inbound.reservationImport) {
      throw new ChannelImportSimulationError(`Provider does not support reservation import: ${input.provider}`);
    }

    const connection = await this.connectionRepository.findById(input.tenantId, input.connectionId);
    if (!connection) {
      throw new ChannelImportSimulationError("Connection not found");
    }
    if (connection.status !== "active") {
      throw new ChannelImportSimulationError("Connection is not active");
    }
    if (connection.credentialRef == null) {
      throw new ChannelImportSimulationError("Connection is missing credential reference");
    }

    const externalListingId = input.message.externalListingId;
    const externalReservationId = input.message.externalReservationId;
    if (!externalListingId || !externalReservationId) {
      throw new ChannelImportSimulationError("Message is missing external listing or reservation id");
    }

    const mapping = await this.mappingRepository.findByExternalListing(
      input.tenantId,
      input.connectionId,
      externalListingId,
      input.message.externalUnitId ?? null,
    );
    if (!mapping) {
      throw new ChannelImportSimulationError("Listing mapping not found");
    }
    if (mapping.status !== "active") {
      throw new ChannelImportSimulationError("Listing mapping is not active");
    }

    const existingLink = await this.linkRepository.findByExternalReservation(
      input.tenantId,
      input.connectionId,
      externalReservationId,
    );
    if (existingLink) {
      return {
        duplicate: true,
        link: existingLink,
        command: null,
        mappingVersionUsed: existingLink.mappingVersionAtImport,
      };
    }

    const importMapping = await this.importProvider.mapMessage(input.message, {
      tenantId: input.tenantId,
      propertyId: mapping.propertyId,
      unitId: mapping.unitId,
      connectionId: input.connectionId,
    });
    if (importMapping.kind !== "create") {
      throw new ChannelImportSimulationError(
        importMapping.kind === "unrecognized"
          ? importMapping.reason
          : "Only reservation create imports are supported in simulation",
      );
    }

    const command = importMapping.command;
    if (
      command.propertyId !== mapping.propertyId ||
      command.unitId !== mapping.unitId ||
      command.tenantId !== input.tenantId
    ) {
      throw new ChannelImportSimulationError("Normalized command does not match resolved mapping");
    }

    const link = ExternalReservationLink.createLink({
      id: input.linkId ?? `link-${externalReservationId}`,
      tenantId: input.tenantId,
      provider: input.provider,
      connectionId: input.connectionId,
      externalReservationId,
      bookingId: input.simulatedBookingId ?? SIMULATED_BOOKING_ID,
      mappingId: mapping.id,
      mappingVersion: mapping.mappingVersion,
      externalRevision: input.message.payload.externalRevision as string | undefined,
      lastExternalUpdateAt: input.message.externalUpdatedAt,
    });
    await this.linkRepository.save(link);

    return {
      duplicate: false,
      link,
      command,
      mappingVersionUsed: mapping.mappingVersion,
    };
  }
}

export async function seedActiveConnection(
  repository: IChannelConnectionRepository,
  input: {
    id: string;
    tenantId: string;
    provider: ChannelSource;
    displayName?: string;
    credentialRef?: string;
  },
): Promise<ChannelConnection> {
  const connection = ChannelConnection.createDraft({
    id: input.id,
    tenantId: input.tenantId,
    provider: input.provider,
    displayName: input.displayName ?? "Fake Channel Connection",
  });
  connection.attachCredentials(
    CredentialReference.create(input.credentialRef ?? "cred_fake_001"),
  );
  connection.activate();
  await repository.create(connection);
  return connection;
}

export async function seedActiveMapping(
  repository: IChannelListingMappingRepository,
  input: {
    id: string;
    tenantId: string;
    connectionId: string;
    externalListingId: string;
    externalUnitId?: string | null;
    propertyId: string;
    unitId: string;
  },
): Promise<ChannelListingMapping> {
  const mapping = ChannelListingMapping.createActive({
    id: input.id,
    tenantId: input.tenantId,
    connectionId: input.connectionId,
    externalListingId: input.externalListingId,
    externalUnitId: input.externalUnitId,
    propertyId: input.propertyId,
    unitId: input.unitId,
    syncDirection: "bidirectional",
  });
  await repository.save(mapping);
  return mapping;
}
