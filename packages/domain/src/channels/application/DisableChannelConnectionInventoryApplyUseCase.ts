import { Result } from "../../shared/kernel/Result";
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "../../shared/errors/DomainError";
import type { PermissionChecker, ActorContext } from "../../shared/services/PermissionChecker";
import { PERMISSIONS } from "@hcp/permissions";
import type { UseCaseAuditContext } from "../../shared/types/AuditContext";
import type { IChannelConnectionRepository } from "../ports/IChannelConnectionRepository";
import type { IChannelConnectionInventoryApplyStore } from "../ports/IChannelConnectionInventoryApplyStore";

export interface DisableChannelConnectionInventoryApplyCommand {
  tenantId: string;
  connectionId: string;
  expectedSemanticConfigVersion: number;
}

export interface DisableChannelConnectionInventoryApplyResult {
  connectionId: string;
  inventoryApplyEnabled: false;
  alreadyDisabled: boolean;
  semanticConfigVersion: number;
}

/**
 * P1-S7c — disable connection inventory apply (fence only).
 * Does not pause, release inventory, supersede pending, or cancel jobs.
 */
export class DisableChannelConnectionInventoryApplyUseCase {
  constructor(
    private readonly connectionRepository: IChannelConnectionRepository,
    private readonly store: IChannelConnectionInventoryApplyStore,
    private readonly permissionChecker: PermissionChecker,
  ) {}

  async execute(
    command: DisableChannelConnectionInventoryApplyCommand,
    actor: ActorContext,
    audit: UseCaseAuditContext,
  ): Promise<Result<DisableChannelConnectionInventoryApplyResult, Error>> {
    try {
      const tenantId = command.tenantId.trim();
      const connectionId = command.connectionId.trim();
      if (!tenantId || !connectionId) {
        return Result.fail(new ValidationError("tenantId and connectionId are required"));
      }
      if (
        !Number.isInteger(command.expectedSemanticConfigVersion) ||
        command.expectedSemanticConfigVersion < 1
      ) {
        return Result.fail(
          new ValidationError("expectedSemanticConfigVersion must be a positive integer"),
        );
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

      const outcome = await this.store.disable({
        tenantId,
        connectionId,
        expectedSemanticConfigVersion: command.expectedSemanticConfigVersion,
        actorId: audit.actorId,
        ipAddress: audit.ipAddress ?? null,
      });

      return Result.ok({
        connectionId,
        inventoryApplyEnabled: false,
        alreadyDisabled: outcome.alreadyDisabled,
        semanticConfigVersion: outcome.semanticConfigVersion,
      });
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}
