import { Result } from "../../shared/kernel/Result";
import { ForbiddenError, ValidationError } from "../../shared/errors/DomainError";
import type { UseCaseAuditContext } from "../../shared/types/AuditContext";
import type { PermissionChecker, ActorContext } from "../../shared/services/PermissionChecker";
import { PERMISSIONS } from "@hcp/permissions";
import { ChannelConnection } from "../domain/ChannelConnection";
import type { IChannelConnectionRepository } from "../ports/IChannelConnectionRepository";
import type { IIdGenerator } from "../../shared/ports/IIdGenerator";
import type { IAuditLogRepository } from "../../shared/ports/InfrastructurePorts";
import { CHANNEL_SOURCES, type ChannelSource } from "../types/ChannelSource";
import {
  toChannelConnectionOperatorReadModel,
  type ChannelConnectionOperatorReadModel,
} from "./ChannelConnectionOperatorReadModel";

export interface CreateChannelConnectionCommand {
  tenantId: string;
  provider: ChannelSource;
  displayName: string;
  connectionId?: string;
  now?: Date;
}

function isChannelSource(value: string): value is ChannelSource {
  return (CHANNEL_SOURCES as readonly string[]).includes(value);
}

/**
 * Create a draft ChannelConnection (CM-4b S4a-1).
 * Provider must be a known ChannelSource; registration is enforced at activate (S3e).
 */
export class CreateChannelConnectionUseCase {
  constructor(
    private readonly connectionRepository: IChannelConnectionRepository,
    private readonly permissionChecker: PermissionChecker,
    private readonly idGenerator: IIdGenerator,
    private readonly auditLog: IAuditLogRepository,
  ) {}

  async execute(
    command: CreateChannelConnectionCommand,
    actor: ActorContext,
    audit: UseCaseAuditContext,
  ): Promise<Result<ChannelConnectionOperatorReadModel, Error>> {
    try {
      const tenantId = command.tenantId.trim();
      if (tenantId.length === 0) {
        return Result.fail(new ValidationError("tenantId is required"));
      }
      if (
        !this.permissionChecker.hasPermission(
          actor,
          PERMISSIONS.CHANNELS_CONNECTION_MANAGE,
          tenantId,
        )
      ) {
        return Result.fail(new ForbiddenError());
      }
      if (!isChannelSource(command.provider)) {
        return Result.fail(
          new ValidationError(`Invalid channel provider: ${String(command.provider)}`),
        );
      }

      const connectionId =
        command.connectionId?.trim() && command.connectionId.trim().length > 0
          ? command.connectionId.trim()
          : this.idGenerator.generate();

      const connection = ChannelConnection.createDraft({
        id: connectionId,
        tenantId,
        provider: command.provider,
        displayName: command.displayName,
        now: command.now,
      });

      await this.connectionRepository.create(connection);
      await this.auditLog.append({
        tenantId,
        actorId: audit.actorId,
        action: "channel.connection.created",
        resourceType: "ChannelConnection",
        resourceId: connection.id,
        metadata: {
          provider: connection.provider,
          displayName: connection.displayName,
          status: connection.status,
        },
        ipAddress: audit.ipAddress,
      });

      return Result.ok(toChannelConnectionOperatorReadModel(connection));
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}
