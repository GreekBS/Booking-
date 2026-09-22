import { Result } from "../../shared/kernel/Result";
import { ValidationError } from "../../shared/errors/DomainError";
import type { ChannelSource } from "../types/ChannelSource";
import type { ChannelProviderMessage } from "../types/ChannelProviderMessage";
import type { ChannelReservationCancelMapping } from "../types/ChannelReservationImportMapping";
import type { ExternalReservationLink } from "../domain/ExternalReservationLink";
import type { IChannelConnectionRepository } from "../ports/IChannelConnectionRepository";
import type { IExternalReservationLinkRepository } from "../ports/IExternalReservationLinkRepository";
import type { IChannelProviderRegistry } from "../ports/providers/IChannelProviderRegistry";

export type ImportChannelReservationCancelDryRunResult =
  | {
      duplicate: true;
      reason: "already_cancelled";
      existingLink: ExternalReservationLink;
    }
  | {
      duplicate: false;
      mapping: ChannelReservationCancelMapping;
      existingLink: ExternalReservationLink;
    };

export interface ImportChannelReservationCancelDryRunCommand {
  tenantId: string;
  connectionId: string;
  provider: ChannelSource;
  message: ChannelProviderMessage;
}

export class ImportChannelReservationCancelDryRunUseCase {
  constructor(
    private readonly registry: IChannelProviderRegistry,
    private readonly connectionRepository: IChannelConnectionRepository,
    private readonly linkRepository: IExternalReservationLinkRepository,
  ) {}

  async execute(
    command: ImportChannelReservationCancelDryRunCommand,
  ): Promise<Result<ImportChannelReservationCancelDryRunResult, Error>> {
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
            "External reservation link not found; cancel cannot invent a booking",
          ),
        );
      }

      if (existingLink.status === "archived") {
        return Result.ok({
          duplicate: true,
          reason: "already_cancelled",
          existingLink,
        });
      }

      const importMapping = await importProvider.mapMessage(command.message, {
        tenantId: command.tenantId,
        connectionId: command.connectionId,
        propertyId: "unused",
        unitId: "unused",
      });
      if (importMapping.kind !== "cancel") {
        const reason =
          importMapping.kind === "unrecognized"
            ? importMapping.reason
            : "Only reservation cancel imports are supported";
        return Result.fail(new ValidationError(reason));
      }

      return Result.ok({
        duplicate: false,
        mapping: importMapping.mapping,
        existingLink,
      });
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}
