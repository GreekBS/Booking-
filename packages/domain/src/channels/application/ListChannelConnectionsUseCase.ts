import { Result } from "../../shared/kernel/Result";
import { ForbiddenError, ValidationError } from "../../shared/errors/DomainError";
import type { PermissionChecker, ActorContext } from "../../shared/services/PermissionChecker";
import { PERMISSIONS } from "@hcp/permissions";
import type { IChannelConnectionRepository } from "../ports/IChannelConnectionRepository";
import {
  toChannelConnectionOperatorReadModel,
  type ChannelConnectionOperatorReadModel,
} from "./ChannelConnectionOperatorReadModel";

export interface ListChannelConnectionsCommand {
  tenantId: string;
}

export class ListChannelConnectionsUseCase {
  constructor(
    private readonly connectionRepository: IChannelConnectionRepository,
    private readonly permissionChecker: PermissionChecker,
  ) {}

  async execute(
    command: ListChannelConnectionsCommand,
    actor: ActorContext,
  ): Promise<Result<ChannelConnectionOperatorReadModel[], Error>> {
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

      const connections = await this.connectionRepository.listByTenant(tenantId);
      return Result.ok(connections.map(toChannelConnectionOperatorReadModel));
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}
