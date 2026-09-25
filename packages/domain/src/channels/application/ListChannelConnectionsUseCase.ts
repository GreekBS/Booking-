import { Result } from "../../shared/kernel/Result";
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "../../shared/errors/DomainError";
import type { PermissionChecker, ActorContext } from "../../shared/services/PermissionChecker";
import { PERMISSIONS } from "@hcp/permissions";
import type { IPropertyRepository } from "../../catalog/ports/ICatalogRepositories";
import type { IChannelConnectionRepository } from "../ports/IChannelConnectionRepository";
import type { IChannelConnectionPropertyRelevanceReader } from "../ports/IChannelConnectionPropertyRelevanceReader";
import {
  assertActorCanAccessChannelProperty,
} from "./ChannelConnectionPropertyAuthorization";
import {
  toChannelConnectionOperatorReadModel,
  type ChannelConnectionOperatorReadModel,
} from "./ChannelConnectionOperatorReadModel";

export interface ListChannelConnectionsCommand {
  tenantId: string;
  /** Active Property scope — required for operator workspace lists. */
  propertyId: string;
}

export class ListChannelConnectionsUseCase {
  constructor(
    private readonly connectionRepository: IChannelConnectionRepository,
    private readonly relevanceReader: IChannelConnectionPropertyRelevanceReader,
    private readonly propertyRepository: IPropertyRepository,
    private readonly permissionChecker: PermissionChecker,
  ) {}

  async execute(
    command: ListChannelConnectionsCommand,
    actor: ActorContext,
  ): Promise<Result<ChannelConnectionOperatorReadModel[], Error>> {
    try {
      const tenantId = command.tenantId.trim();
      const propertyId = command.propertyId.trim();
      if (tenantId.length === 0) {
        return Result.fail(new ValidationError("tenantId is required"));
      }
      if (propertyId.length === 0) {
        return Result.fail(new ValidationError("propertyId is required"));
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

      assertActorCanAccessChannelProperty(
        this.permissionChecker,
        actor,
        tenantId,
        propertyId,
      );

      const property = await this.propertyRepository.findById(tenantId, propertyId);
      if (!property) {
        return Result.fail(new NotFoundError("Property", propertyId));
      }

      const connections = await this.relevanceReader.listRelevantToProperty(
        tenantId,
        propertyId,
      );
      return Result.ok(connections.map(toChannelConnectionOperatorReadModel));
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}
