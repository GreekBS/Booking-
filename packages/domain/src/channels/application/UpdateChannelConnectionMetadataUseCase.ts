import { Result } from "../../shared/kernel/Result";
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "../../shared/errors/DomainError";
import type { UseCaseAuditContext } from "../../shared/types/AuditContext";
import type { PermissionChecker, ActorContext } from "../../shared/services/PermissionChecker";
import { PERMISSIONS } from "@hcp/permissions";
import type { IChannelConnectionRepository } from "../ports/IChannelConnectionRepository";
import type { IAuditLogRepository } from "../../shared/ports/InfrastructurePorts";
import {
  toChannelConnectionOperatorReadModel,
  type ChannelConnectionOperatorReadModel,
} from "./ChannelConnectionOperatorReadModel";

export interface UpdateChannelConnectionMetadataCommand {
  tenantId: string;
  connectionId: string;
  displayName: string;
  now?: Date;
}

/**
 * Update displayName only. Never writes provider, semantics, or lifecycle status.
 */
export class UpdateChannelConnectionMetadataUseCase {
  constructor(
    private readonly connectionRepository: IChannelConnectionRepository,
    private readonly permissionChecker: PermissionChecker,
    private readonly auditLog: IAuditLogRepository,
  ) {}

  async execute(
    command: UpdateChannelConnectionMetadataCommand,
    actor: ActorContext,
    audit: UseCaseAuditContext,
  ): Promise<Result<ChannelConnectionOperatorReadModel, Error>> {
    try {
      const tenantId = command.tenantId.trim();
      const connectionId = command.connectionId.trim();
      if (tenantId.length === 0) {
        return Result.fail(new ValidationError("tenantId is required"));
      }
      if (connectionId.length === 0) {
        return Result.fail(new ValidationError("connectionId is required"));
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

      const connection = await this.connectionRepository.findById(tenantId, connectionId);
      if (!connection) {
        return Result.fail(new NotFoundError("ChannelConnection", connectionId));
      }

      const previousDisplayName = connection.displayName;
      connection.updateDisplayName(command.displayName, command.now);
      await this.connectionRepository.saveNonSemanticChanges(connection);

      await this.auditLog.append({
        tenantId,
        actorId: audit.actorId,
        action: "channel.connection.metadata_updated",
        resourceType: "ChannelConnection",
        resourceId: connection.id,
        metadata: {
          previousDisplayName,
          displayName: connection.displayName,
        },
        ipAddress: audit.ipAddress,
      });

      return Result.ok(toChannelConnectionOperatorReadModel(connection));
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}
