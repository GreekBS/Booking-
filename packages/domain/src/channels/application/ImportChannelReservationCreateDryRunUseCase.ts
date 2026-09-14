import { Result } from "../../shared/kernel/Result";
import { ValidationError } from "../../shared/errors/DomainError";
import type { ChannelSource } from "../types/ChannelSource";
import type { ChannelProviderMessage } from "../types/ChannelProviderMessage";
import type { IChannelConnectionRepository } from "../ports/IChannelConnectionRepository";
import type { IChannelListingMappingRepository } from "../ports/IChannelListingMappingRepository";
import type { IExternalReservationLinkRepository } from "../ports/IExternalReservationLinkRepository";
import type { IChannelProviderRegistry } from "../ports/providers/IChannelProviderRegistry";
import type { ImportChannelReservationCreateDryRunResult } from "./ImportChannelReservationCreateDryRunResult";

export interface ImportChannelReservationCreateDryRunCommand {
  tenantId: string;
  connectionId: string;
  provider: ChannelSource;
  message: ChannelProviderMessage;
}

export class ImportChannelReservationCreateDryRunUseCase {
  constructor(
    private readonly registry: IChannelProviderRegistry,
    private readonly connectionRepository: IChannelConnectionRepository,
    private readonly mappingRepository: IChannelListingMappingRepository,
    private readonly linkRepository: IExternalReservationLinkRepository,
  ) {}

  async execute(
    command: ImportChannelReservationCreateDryRunCommand,
  ): Promise<Result<ImportChannelReservationCreateDryRunResult, Error>> {
    try {
      const importProvider = this.registry.resolveReservationImport(command.provider);
      if (!importProvider) {
        return Result.fail(
          new ValidationError(`Provider does not support reservation import: ${command.provider}`),
        );
      }

      const connection = await this.connectionRepository.findById(
        command.tenantId,
        command.connectionId,
      );
      if (!connection) {
        return Result.fail(new ValidationError("Connection not found"));
      }
      if (connection.status !== "active") {
        return Result.fail(new ValidationError("Connection is not active"));
      }
      if (connection.credentialRef == null) {
        return Result.fail(new ValidationError("Connection is missing credential reference"));
      }

      const externalListingId = command.message.externalListingId;
      const externalReservationId = command.message.externalReservationId;
      if (!externalListingId || !externalReservationId) {
        return Result.fail(
          new ValidationError("Message is missing external listing or reservation id"),
        );
      }

      const mapping = await this.mappingRepository.findByExternalListing(
        command.tenantId,
        command.connectionId,
        externalListingId,
        command.message.externalUnitId ?? null,
      );
      if (!mapping) {
        return Result.fail(new ValidationError("Listing mapping not found"));
      }
      if (mapping.status !== "active") {
        return Result.fail(new ValidationError("Listing mapping is not active"));
      }

      const existingLink = await this.linkRepository.findByExternalReservation(
        command.tenantId,
        command.connectionId,
        externalReservationId,
      );
      if (existingLink) {
        return Result.ok({
          duplicate: true,
          existingLink,
          command: null,
          mappingVersionUsed: existingLink.mappingVersionAtImport,
        });
      }

      const importMapping = await importProvider.mapMessage(command.message, {
        tenantId: command.tenantId,
        connectionId: command.connectionId,
        propertyId: mapping.propertyId,
        unitId: mapping.unitId,
      });
      if (importMapping.kind !== "create") {
        const reason =
          importMapping.kind === "unrecognized"
            ? importMapping.reason
            : "Only reservation create imports are supported";
        return Result.fail(new ValidationError(reason));
      }

      const normalizedCommand = importMapping.command;
      if (
        normalizedCommand.tenantId !== command.tenantId ||
        normalizedCommand.propertyId !== mapping.propertyId ||
        normalizedCommand.unitId !== mapping.unitId
      ) {
        return Result.fail(
          new ValidationError("Normalized command does not match resolved mapping"),
        );
      }

      return Result.ok({
        duplicate: false,
        command: normalizedCommand,
        mappingContext: {
          mappingId: mapping.id,
          mappingVersion: mapping.mappingVersion,
          propertyId: mapping.propertyId,
          unitId: mapping.unitId,
          connectionId: command.connectionId,
        },
        mappingVersionUsed: mapping.mappingVersion,
      });
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}
