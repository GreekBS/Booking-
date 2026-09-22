import { Result } from "../../shared/kernel/Result";
import { ValidationError } from "../../shared/errors/DomainError";
import type { ChannelSource } from "../types/ChannelSource";
import type { ChannelProviderMessage } from "../types/ChannelProviderMessage";
import type { ChannelReservationModifyMapping } from "../types/ChannelReservationImportMapping";
import type { ExternalReservationLink } from "../domain/ExternalReservationLink";
import type { IChannelConnectionRepository } from "../ports/IChannelConnectionRepository";
import type { IChannelListingMappingRepository } from "../ports/IChannelListingMappingRepository";
import type { IExternalReservationLinkRepository } from "../ports/IExternalReservationLinkRepository";
import type { IChannelProviderRegistry } from "../ports/providers/IChannelProviderRegistry";

export type ImportChannelReservationModifyDryRunResult =
  | {
      duplicate: true;
      reason: "already_applied" | "stale_revision";
      existingLink: ExternalReservationLink;
    }
  | {
      duplicate: false;
      mapping: ChannelReservationModifyMapping;
      existingLink: ExternalReservationLink;
      mappingVersion: number;
    };

export interface ImportChannelReservationModifyDryRunCommand {
  tenantId: string;
  connectionId: string;
  provider: ChannelSource;
  message: ChannelProviderMessage;
}

function isStaleRevision(
  existing: string | null,
  incoming: string | null | undefined,
): boolean {
  if (!incoming || !existing) return false;
  return existing === incoming || existing > incoming;
}

export class ImportChannelReservationModifyDryRunUseCase {
  constructor(
    private readonly registry: IChannelProviderRegistry,
    private readonly connectionRepository: IChannelConnectionRepository,
    private readonly mappingRepository: IChannelListingMappingRepository,
    private readonly linkRepository: IExternalReservationLinkRepository,
  ) {}

  async execute(
    command: ImportChannelReservationModifyDryRunCommand,
  ): Promise<Result<ImportChannelReservationModifyDryRunResult, Error>> {
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
      if (!connection || connection.status !== "active") {
        return Result.fail(new ValidationError("Connection is not active"));
      }

      const externalReservationId = command.message.externalReservationId?.trim();
      if (!externalReservationId) {
        return Result.fail(new ValidationError("External reservation id is required"));
      }

      const existingLink = await this.linkRepository.findByExternalReservation(
        command.tenantId,
        command.connectionId,
        externalReservationId,
      );
      if (!existingLink) {
        return Result.fail(
          new ValidationError(
            "External reservation link not found; modify cannot invent a booking",
          ),
        );
      }

      const listingId = command.message.externalListingId;
      const mapping = listingId
        ? await this.mappingRepository.findByExternalListing(
            command.tenantId,
            command.connectionId,
            listingId,
            command.message.externalUnitId ?? null,
          )
        : await this.mappingRepository.findById(
            command.tenantId,
            existingLink.mappingId,
          );

      if (!mapping || mapping.status !== "active") {
        return Result.fail(new ValidationError("Listing mapping not found"));
      }

      const importMapping = await importProvider.mapMessage(command.message, {
        tenantId: command.tenantId,
        connectionId: command.connectionId,
        propertyId: mapping.propertyId,
        unitId: mapping.unitId,
      });
      if (importMapping.kind !== "modify") {
        const reason =
          importMapping.kind === "unrecognized"
            ? importMapping.reason
            : "Only reservation modify imports are supported";
        return Result.fail(new ValidationError(reason));
      }

      const incomingRevision =
        typeof command.message.payload.externalRevision === "string"
          ? command.message.payload.externalRevision
          : command.message.messageId;

      if (isStaleRevision(existingLink.externalRevision, incomingRevision)) {
        return Result.ok({
          duplicate: true,
          reason: "stale_revision",
          existingLink,
        });
      }

      return Result.ok({
        duplicate: false,
        mapping: importMapping.mapping,
        existingLink,
        mappingVersion: mapping.mappingVersion,
      });
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}
