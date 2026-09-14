import { Result } from "../../shared/kernel/Result";
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "../../shared/errors/DomainError";
import type { PermissionChecker, ActorContext } from "../../shared/services/PermissionChecker";
import { PERMISSIONS } from "@hcp/permissions";
import type { ReceiveChannelEventResult } from "./ReceiveChannelEventUseCase";
import type { ReplayChannelInboxItemUseCase } from "./ReplayChannelInboxItemUseCase";
import type { IChannelConnectionRepository } from "../ports/IChannelConnectionRepository";
import type { IChannelInboxRepository } from "../ports/IChannelInboxRepository";

export interface ReplayChannelConnectionInboxItemCommand {
  tenantId: string;
  connectionId: string;
  inboxItemId: string;
  correlationId?: string | null;
}

/**
 * CM-4b S4a-2b — operator replay scoped to a connection.
 * Verifies tenant permission, connection ownership, and inbox→connection match
 * before delegating to ReplayChannelInboxItemUseCase.
 */
export class ReplayChannelConnectionInboxItemUseCase {
  constructor(
    private readonly connectionRepository: IChannelConnectionRepository,
    private readonly inboxRepository: IChannelInboxRepository,
    private readonly replayChannelInboxItemUseCase: ReplayChannelInboxItemUseCase,
    private readonly permissionChecker: PermissionChecker,
  ) {}

  async execute(
    command: ReplayChannelConnectionInboxItemCommand,
    actor: ActorContext,
  ): Promise<Result<ReceiveChannelEventResult, Error>> {
    try {
      const tenantId = command.tenantId.trim();
      const connectionId = command.connectionId.trim();
      const inboxItemId = command.inboxItemId.trim();
      if (tenantId.length === 0) {
        return Result.fail(new ValidationError("tenantId is required"));
      }
      if (connectionId.length === 0) {
        return Result.fail(new ValidationError("connectionId is required"));
      }
      if (inboxItemId.length === 0) {
        return Result.fail(new ValidationError("inboxItemId is required"));
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

      const inboxItem = await this.inboxRepository.findById(tenantId, inboxItemId);
      if (!inboxItem || inboxItem.connectionId !== connectionId) {
        return Result.fail(new NotFoundError("ChannelInboxItem", inboxItemId));
      }

      return this.replayChannelInboxItemUseCase.execute({
        tenantId,
        sourceInboxItemId: inboxItemId,
        correlationId: command.correlationId,
      });
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}
