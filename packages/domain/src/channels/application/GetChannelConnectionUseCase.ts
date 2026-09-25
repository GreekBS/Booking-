import { Result } from "../../shared/kernel/Result";
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "../../shared/errors/DomainError";
import type { PermissionChecker, ActorContext } from "../../shared/services/PermissionChecker";
import { PERMISSIONS } from "@hcp/permissions";
import type { IChannelConnectionRepository } from "../ports/IChannelConnectionRepository";
import type { IChannelConnectionPropertyRelevanceReader } from "../ports/IChannelConnectionPropertyRelevanceReader";
import { assertActorCanReadChannelConnection } from "./ChannelConnectionPropertyAuthorization";
import {
  toChannelConnectionOperatorReadModel,
  type ChannelConnectionOperatorReadModel,
} from "./ChannelConnectionOperatorReadModel";

export interface GetChannelConnectionCommand {
  tenantId: string;
  connectionId: string;
}

export class GetChannelConnectionUseCase {
  constructor(
    private readonly connectionRepository: IChannelConnectionRepository,
    private readonly relevanceReader: IChannelConnectionPropertyRelevanceReader,
    private readonly permissionChecker: PermissionChecker,
  ) {}

  async execute(
    command: GetChannelConnectionCommand,
    actor: ActorContext,
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

      const relevantPropertyIds = await this.relevanceReader.resolveRelevantPropertyIds(
        tenantId,
        connectionId,
      );
      assertActorCanReadChannelConnection(
        this.permissionChecker,
        actor,
        tenantId,
        relevantPropertyIds,
      );

      return Result.ok(toChannelConnectionOperatorReadModel(connection));
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}
