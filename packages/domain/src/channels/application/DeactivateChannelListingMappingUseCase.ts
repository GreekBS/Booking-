import { Result } from "../../shared/kernel/Result";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "../../shared/errors/DomainError";
import type { UseCaseAuditContext } from "../../shared/types/AuditContext";
import type { ActorContext, PermissionChecker } from "../../shared/services/PermissionChecker";
import { PERMISSIONS } from "@hcp/permissions";
import type { ChannelConnectionStatus } from "../domain/ChannelConnectionStatus";
import type { IChannelConnectionRepository } from "../ports/IChannelConnectionRepository";
import type { IChannelListingMappingRepository } from "../ports/IChannelListingMappingRepository";
import type {
  IcalMappingLifecycleMutationResult,
  IIcalChannelMappingLifecycleStore,
} from "../ports/IIcalChannelMappingLifecycleStore";

export type DeactivateChannelListingMappingMode = "paused" | "archived";

export interface DeactivateChannelListingMappingCommand {
  tenantId: string;
  connectionId: string;
  mappingId: string;
  /** `paused` keeps the mapping recoverable; `archived` is terminal. */
  mode?: DeactivateChannelListingMappingMode;
  expectedSemanticConfigVersion: number;
  reason?: string | null;
  now?: Date;
}

export interface DeactivateChannelListingMappingResult
  extends IcalMappingLifecycleMutationResult {
  readonly connectionId: string;
  readonly mode: DeactivateChannelListingMappingMode;
}

/** Removing inventory ownership requires a paused connection. */
const PAUSED_ONLY: readonly ChannelConnectionStatus[] = ["paused"];

/**
 * P1-S6c listing mapping deactivation for iCal connections.
 *
 * Runs under `channel_connections FOR UPDATE` and requires a paused connection:
 * dropping the active mapping removes the inventory source, so the operator must
 * pause first. Pending reconciliation generations are superseded and the poll
 * cursor is baseline-reset under a new epoch; already-materialized
 * `channel_import` blocks are retained (V1 no-removal).
 *
 * Replacement is not done here — use `UpsertChannelListingMappingUseCase` with
 * `replaceMappingId` so the deactivate and create land in one transaction.
 */
export class DeactivateChannelListingMappingUseCase {
  constructor(
    private readonly connectionRepository: IChannelConnectionRepository,
    private readonly mappingRepository: IChannelListingMappingRepository,
    private readonly lifecycleStore: IIcalChannelMappingLifecycleStore,
    private readonly permissionChecker: PermissionChecker,
  ) {}

  async execute(
    command: DeactivateChannelListingMappingCommand,
    actor: ActorContext,
    audit: UseCaseAuditContext,
  ): Promise<Result<DeactivateChannelListingMappingResult, Error>> {
    try {
      const tenantId = requireId(command.tenantId, "tenantId");
      const connectionId = requireId(command.connectionId, "connectionId");
      const mappingId = requireId(command.mappingId, "mappingId");
      const mode: DeactivateChannelListingMappingMode = command.mode ?? "paused";

      if (
        !this.permissionChecker.hasPermission(
          actor,
          PERMISSIONS.CHANNELS_CONNECTION_MANAGE,
          tenantId,
        )
      ) {
        return Result.fail(new ForbiddenError());
      }

      if (!Number.isInteger(command.expectedSemanticConfigVersion) ||
        command.expectedSemanticConfigVersion < 1) {
        return Result.fail(
          new ValidationError("expectedSemanticConfigVersion must be a positive integer"),
        );
      }

      const now = command.now ?? new Date();
      const reason = normalizeReason(command.reason);

      const connection = await this.connectionRepository.findById(tenantId, connectionId);
      if (!connection) {
        return Result.fail(new NotFoundError("ChannelConnection", connectionId));
      }
      if (connection.provider !== "ical") {
        return Result.fail(
          new ConflictError(
            "iCal mapping lifecycle is only supported for iCal connections",
            "provider_mismatch",
          ),
        );
      }

      const mapping = await this.mappingRepository.findById(tenantId, mappingId);
      if (!mapping || mapping.connectionId !== connectionId) {
        return Result.fail(new NotFoundError("ChannelListingMapping", mappingId));
      }

      const previousMappingStatus = mapping.status;
      const wasActive = previousMappingStatus === "active";
      if (mode === "archived") {
        mapping.archive(now);
      } else {
        mapping.pause(now);
      }

      const result = await this.lifecycleStore.mutateUnderConnectionLock({
        tenantId,
        connectionId,
        actorId: audit.actorId,
        mutationKind: "deactivate",
        allowedConnectionStatuses: PAUSED_ONLY,
        expectedSemanticConfigVersion: command.expectedSemanticConfigVersion,
        mapping: null,
        deactivatedMapping: mapping,
        // Only removing an active inventory source invalidates pending work.
        requiresEpochBump: wasActive,
        auditAction: "channel.connection.listing_mapping_deactivated",
        auditMetadata: {
          mode,
          previousMappingStatus,
        },
        reason,
        ipAddress: audit.ipAddress,
        now,
      });

      return Result.ok({ ...result, connectionId, mode });
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

function requireId(value: string, label: string): string {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (trimmed.length === 0) {
    throw new ValidationError(`${label} is required`);
  }
  return trimmed;
}

function normalizeReason(reason: string | null | undefined): string | null {
  if (reason == null) {
    return null;
  }
  const trimmed = reason.trim();
  if (trimmed.length === 0) {
    return null;
  }
  if (trimmed.length > 500) {
    throw new ValidationError("reason must be at most 500 characters");
  }
  return trimmed;
}
