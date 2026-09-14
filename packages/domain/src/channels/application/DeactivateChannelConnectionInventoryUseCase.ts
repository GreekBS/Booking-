import { Result } from "../../shared/kernel/Result";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "../../shared/errors/DomainError";
import type { PermissionChecker, ActorContext } from "../../shared/services/PermissionChecker";
import { PERMISSIONS } from "@hcp/permissions";
import type { UseCaseAuditContext } from "../../shared/types/AuditContext";
import type { IChannelConnectionRepository } from "../ports/IChannelConnectionRepository";
import type { IDeactivateChannelConnectionInventoryStore } from "../ports/IDeactivateChannelConnectionInventoryStore";

export interface DeactivateChannelConnectionInventoryCommand {
  tenantId: string;
  connectionId: string;
  /** Optional CAS; when omitted, uses live connection semantic version. */
  expectedSemanticConfigVersion?: number;
}

export interface DeactivateChannelConnectionInventoryResult {
  connectionId: string;
  connectionStatus: "paused";
  releasedCount: number;
  alreadyPaused: boolean;
  semanticConfigVersion: number;
}

/**
 * P1-S7b — emergency operator rollback:
 * pause connection (if active) + release ALL active channel_import for the connection
 * (all epochs/mappings/units). Never touches Hold/Booking/other connections.
 */
export class DeactivateChannelConnectionInventoryUseCase {
  constructor(
    private readonly connectionRepository: IChannelConnectionRepository,
    private readonly store: IDeactivateChannelConnectionInventoryStore,
    private readonly permissionChecker: PermissionChecker,
  ) {}

  async execute(
    command: DeactivateChannelConnectionInventoryCommand,
    actor: ActorContext,
    audit: UseCaseAuditContext,
  ): Promise<Result<DeactivateChannelConnectionInventoryResult, Error>> {
    try {
      const tenantId = command.tenantId.trim();
      const connectionId = command.connectionId.trim();
      if (!tenantId || !connectionId) {
        return Result.fail(new ValidationError("tenantId and connectionId are required"));
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
      if (
        connection.status !== "active" &&
        connection.status !== "paused"
      ) {
        return Result.fail(
          new ConflictError(
            `Cannot deactivate inventory for connection in status: ${connection.status}`,
            "lifecycle_status_conflict",
          ),
        );
      }

      const expectedSemanticConfigVersion =
        command.expectedSemanticConfigVersion ?? connection.semanticConfigVersion;

      const outcome = await this.store.deactivate({
        tenantId,
        connectionId,
        expectedSemanticConfigVersion,
        actorId: audit.actorId,
        ipAddress: audit.ipAddress ?? null,
      });

      return Result.ok({
        connectionId,
        connectionStatus: "paused",
        releasedCount: outcome.releasedCount,
        alreadyPaused: outcome.alreadyPaused,
        semanticConfigVersion: outcome.semanticConfigVersion,
      });
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}
