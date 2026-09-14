import { Result } from "../../shared/kernel/Result";
import { ForbiddenError, NotFoundError, ValidationError } from "../../shared/errors/DomainError";
import type { PermissionChecker, ActorContext } from "../../shared/services/PermissionChecker";
import { PERMISSIONS } from "@hcp/permissions";
import type { ChannelConnectionStatus } from "../domain/ChannelConnectionStatus";
import { ChannelProviderRegistrationError } from "../errors/ChannelProviderRegistrationError";
import type { IChannelConnectionRepository } from "../ports/IChannelConnectionRepository";
import type { IChannelProviderRegistry } from "../ports/providers/IChannelProviderRegistry";
import type { ChannelSource } from "../types/ChannelSource";
import {
  FEED_SEMANTIC_MODES,
  type FeedSemanticMode,
} from "../types/FeedSemanticMode";
import { resolveAllowedFeedSemanticModes } from "../types/FeedSemanticModePolicy";

export interface GetChannelConnectionSemanticConfigurationCommand {
  tenantId: string;
  connectionId: string;
}

export interface ChannelConnectionSemanticConfigurationResult {
  connectionId: string;
  provider: ChannelSource;
  lifecycleStatus: ChannelConnectionStatus;
  semanticMode: FeedSemanticMode;
  semanticConfigVersion: number;
  allowedSemanticModes: FeedSemanticMode[];
  canDeclareReservationFeed: boolean;
  connectionUpdatedAt: Date;
}

function normalizeRequiredId(value: string, label: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new ValidationError(`${label} is required`);
  }
  return trimmed;
}

/**
 * Deterministic sort: canonical FEED_SEMANTIC_MODES order, then any extras lexicographically.
 */
export function sortAllowedFeedSemanticModes(
  modes: readonly FeedSemanticMode[],
): FeedSemanticMode[] {
  const rank = new Map<string, number>(
    FEED_SEMANTIC_MODES.map((mode, index) => [mode, index]),
  );
  return [...modes].sort((a, b) => {
    const ra = rank.get(a) ?? Number.MAX_SAFE_INTEGER;
    const rb = rank.get(b) ?? Number.MAX_SAFE_INTEGER;
    if (ra !== rb) {
      return ra - rb;
    }
    return a.localeCompare(b);
  });
}

/**
 * Read-only semantic configuration for operator inspection (CM-4b S3f).
 * Does not mutate, call the transition store, or query receipts/cursors/audit.
 */
export class GetChannelConnectionSemanticConfigurationUseCase {
  constructor(
    private readonly connectionRepository: IChannelConnectionRepository,
    private readonly providerRegistry: IChannelProviderRegistry,
    private readonly permissionChecker: PermissionChecker,
  ) {}

  async execute(
    command: GetChannelConnectionSemanticConfigurationCommand,
    actor: ActorContext,
  ): Promise<Result<ChannelConnectionSemanticConfigurationResult, Error>> {
    try {
      const tenantId = normalizeRequiredId(command.tenantId, "tenantId");
      const connectionId = normalizeRequiredId(command.connectionId, "connectionId");

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

      const registration = this.providerRegistry.get(connection.provider);
      if (!registration) {
        return Result.fail(
          new ChannelProviderRegistrationError(
            `Provider registration not found: ${connection.provider}`,
          ),
        );
      }

      let allowedSemanticModes: FeedSemanticMode[];
      try {
        allowedSemanticModes = [
          ...sortAllowedFeedSemanticModes(
            resolveAllowedFeedSemanticModes(registration.allowedFeedSemanticModes),
          ),
        ];
      } catch (error) {
        return Result.fail(
          error instanceof Error
            ? error
            : new ValidationError("Provider allow-list is unresolvable"),
        );
      }

      const canDeclareReservationFeed = this.permissionChecker.hasPermission(
        actor,
        PERMISSIONS.CHANNELS_CONNECTION_DECLARE_RESERVATION_FEED,
        tenantId,
      );

      return Result.ok({
        connectionId: connection.id,
        provider: connection.provider,
        lifecycleStatus: connection.status,
        semanticMode: connection.semanticMode,
        semanticConfigVersion: connection.semanticConfigVersion,
        allowedSemanticModes,
        canDeclareReservationFeed,
        connectionUpdatedAt: connection.updatedAt,
      });
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}
