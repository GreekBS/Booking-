import { Result } from "../../shared/kernel/Result";
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "../../shared/errors/DomainError";
import type { UseCaseAuditContext } from "../../shared/types/AuditContext";
import type { PermissionChecker, ActorContext } from "../../shared/services/PermissionChecker";
import { PERMISSIONS } from "@hcp/permissions";
import type { IPropertyRepository } from "../../catalog/ports/ICatalogRepositories";
import { ChannelConnection } from "../domain/ChannelConnection";
import type { IChannelConnectionRepository } from "../ports/IChannelConnectionRepository";
import type { IIdGenerator } from "../../shared/ports/IIdGenerator";
import type { IAuditLogRepository } from "../../shared/ports/InfrastructurePorts";
import { CHANNEL_SOURCES, type ChannelSource } from "../types/ChannelSource";
import { assertActorCanAccessChannelProperty } from "./ChannelConnectionPropertyAuthorization";
import {
  toChannelConnectionOperatorReadModel,
  type ChannelConnectionOperatorReadModel,
} from "./ChannelConnectionOperatorReadModel";

export interface CreateChannelConnectionCommand {
  tenantId: string;
  provider: ChannelSource;
  displayName: string;
  /** Active Property workspace affinity (required for operator create). */
  workspacePropertyId: string;
  connectionId?: string;
  now?: Date;
}

function isChannelSource(value: string): value is ChannelSource {
  return (CHANNEL_SOURCES as readonly string[]).includes(value);
}

/**
 * Create a draft ChannelConnection (CM-4b S4a-1).
 * Provider must be a known ChannelSource; registration is enforced at activate (S3e).
 * Active Property 1.2: workspacePropertyId stamps operator affinity for unmapped drafts.
 */
export class CreateChannelConnectionUseCase {
  constructor(
    private readonly connectionRepository: IChannelConnectionRepository,
    private readonly propertyRepository: IPropertyRepository,
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
      const workspacePropertyId = command.workspacePropertyId.trim();
      if (tenantId.length === 0) {
        return Result.fail(new ValidationError("tenantId is required"));
      }
      if (workspacePropertyId.length === 0) {
        return Result.fail(new ValidationError("workspacePropertyId is required"));
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

      assertActorCanAccessChannelProperty(
        this.permissionChecker,
        actor,
        tenantId,
        workspacePropertyId,
      );

      const property = await this.propertyRepository.findById(
        tenantId,
        workspacePropertyId,
      );
      if (!property) {
        return Result.fail(new NotFoundError("Property", workspacePropertyId));
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
        workspacePropertyId,
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
          workspacePropertyId,
        },
        ipAddress: audit.ipAddress,
      });

      return Result.ok(toChannelConnectionOperatorReadModel(connection));
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}
