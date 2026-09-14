import { ConflictError, NotFoundError } from "../../shared/errors/DomainError";
import { EMPTY_ICAL_CURSOR_BASELINE_PAYLOAD } from "../providers/ical/map/icalEmptyCursorBaseline";
import type { IChannelListingMappingRepository } from "../ports/IChannelListingMappingRepository";
import type { IPendingChannelReconciliationSuperseder } from "../ports/IPendingChannelReconciliationSuperseder";
import type {
  IcalMappingLifecycleMutationParams,
  IcalMappingLifecycleMutationResult,
  IIcalChannelMappingLifecycleStore,
} from "../ports/IIcalChannelMappingLifecycleStore";
import type { InMemoryChannelConnectionRepository } from "./InMemoryChannelConnectionRepository";
import type { InMemoryChannelPollCursorRepository } from "./InMemoryChannelPollCursorRepository";
import { InMemoryTransitionAuditLog } from "./InMemoryChannelSemanticModeTransitionStore";

/**
 * Logical in-memory parity for the P1-S6c mapping lifecycle transaction.
 * Validates invariants before any write so no rollback is required.
 */
export class InMemoryIcalChannelMappingLifecycleStore
  implements IIcalChannelMappingLifecycleStore
{
  readonly auditLog: InMemoryTransitionAuditLog;

  constructor(
    private readonly connections: InMemoryChannelConnectionRepository,
    private readonly mappings: IChannelListingMappingRepository,
    private readonly cursors: InMemoryChannelPollCursorRepository,
    private readonly superseder: IPendingChannelReconciliationSuperseder | null = null,
    auditLog: InMemoryTransitionAuditLog = new InMemoryTransitionAuditLog(),
  ) {
    this.auditLog = auditLog;
  }

  async mutateUnderConnectionLock(
    params: IcalMappingLifecycleMutationParams,
  ): Promise<IcalMappingLifecycleMutationResult> {
    const now = params.now ?? new Date();

    const connection = await this.connections.findById(
      params.tenantId,
      params.connectionId,
    );
    if (!connection) {
      throw new NotFoundError("ChannelConnection", params.connectionId);
    }
    if (connection.provider !== "ical") {
      throw new ConflictError(
        "iCal mapping lifecycle is only supported for iCal connections",
        "provider_mismatch",
      );
    }
    if (!params.allowedConnectionStatuses.includes(connection.status)) {
      throw new ConflictError(
        `Cannot mutate listing mapping while connection is ${connection.status}`,
        "lifecycle_status_conflict",
      );
    }
    if (connection.semanticConfigVersion !== params.expectedSemanticConfigVersion) {
      throw new ConflictError(
        "ChannelConnection semantic configuration version is stale",
      );
    }

    const persisted = await this.mappings.listByConnection(
      params.tenantId,
      params.connectionId,
    );
    const projected = new Map(persisted.map((m) => [m.id, m.status]));
    if (params.deactivatedMapping) {
      projected.set(params.deactivatedMapping.id, params.deactivatedMapping.status);
    }
    if (params.mapping) {
      projected.set(params.mapping.id, params.mapping.status);
    }
    const activeMappingCount = [...projected.values()].filter(
      (status) => status === "active",
    ).length;
    if (
      connection.semanticMode === "availability_block_feed" &&
      activeMappingCount > 1
    ) {
      throw new ConflictError(
        `iCal availability_block_feed connection must have at most one active listing mapping, found ${activeMappingCount}`,
        "mapping_count_invalid",
      );
    }

    if (params.deactivatedMapping) {
      await this.mappings.save(params.deactivatedMapping);
    }
    if (params.mapping) {
      await this.mappings.save(params.mapping);
    }

    const previousSemanticConfigVersion = connection.semanticConfigVersion;
    let resultingSemanticConfigVersion = previousSemanticConfigVersion;
    let cursorBaselineReset = false;
    let retainedCursorVersion: number | null = null;
    let supersededPendingCount = 0;

    if (params.requiresEpochBump) {
      resultingSemanticConfigVersion = previousSemanticConfigVersion + 1;
      await this.connections.persistSemanticState({
        tenantId: params.tenantId,
        connectionId: params.connectionId,
        expectedSemanticConfigVersion: previousSemanticConfigVersion,
        semanticMode: connection.semanticMode,
        semanticConfigVersion: resultingSemanticConfigVersion,
        updatedAt: now,
      });

      const baseline = await this.cursors.resetPollCursorBaseline({
        tenantId: params.tenantId,
        connectionId: params.connectionId,
        semanticConfigVersion: resultingSemanticConfigVersion,
        baselinePayload: EMPTY_ICAL_CURSOR_BASELINE_PAYLOAD,
      });
      cursorBaselineReset = baseline.cursorRowUpdated;
      retainedCursorVersion = baseline.retainedVersion;

      supersededPendingCount = this.superseder
        ? await this.superseder.supersedePendingForConnection(
            params.tenantId,
            params.connectionId,
          )
        : 0;
    }

    await this.auditLog.append({
      tenantId: params.tenantId,
      actorId: params.actorId,
      action: params.auditAction,
      resourceType: "ChannelConnection",
      resourceId: params.connectionId,
      metadata: {
        ...params.auditMetadata,
        mutationKind: params.mutationKind,
        mappingId: params.mapping?.id ?? null,
        deactivatedMappingId: params.deactivatedMapping?.id ?? null,
        previousSemanticConfigVersion,
        resultingSemanticConfigVersion,
        epochBumped: params.requiresEpochBump,
        cursorBaselineReset,
        supersededPendingCount,
        reason: params.reason ?? null,
      },
      ipAddress: params.ipAddress ?? null,
    });

    return {
      mappingId: params.mapping?.id ?? null,
      mappingVersion: params.mapping?.mappingVersion ?? null,
      mappingStatus: params.mapping?.status ?? null,
      deactivatedMappingId: params.deactivatedMapping?.id ?? null,
      previousSemanticConfigVersion,
      resultingSemanticConfigVersion,
      epochBumped: params.requiresEpochBump,
      cursorBaselineReset,
      retainedCursorVersion,
      supersededPendingCount,
      activeMappingCount,
      requiresPollRematerialization: params.mutationKind !== "noop",
    };
  }
}
