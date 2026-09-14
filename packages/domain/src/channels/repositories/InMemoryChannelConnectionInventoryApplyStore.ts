import { ConflictError } from "../../shared/errors/DomainError";
import type {
  ChannelConnectionInventoryApplyStoreCommand,
  DisableChannelConnectionInventoryApplyStoreResult,
  EnableChannelConnectionInventoryApplyStoreResult,
  IChannelConnectionInventoryApplyStore,
} from "../ports/IChannelConnectionInventoryApplyStore";
import type { InMemoryChannelConnectionRepository } from "./InMemoryChannelConnectionRepository";
import type { InMemoryChannelListingMappingRepository } from "./InMemoryChannelListingMappingRepository";
import type { InMemoryChannelPollCursorRepository } from "./InMemoryChannelPollCursorRepository";
import type { InMemoryIcalCredentialRotationStore } from "./InMemoryIcalCredentialRotationStore";
import type { ChannelInventoryReconciliationRecord } from "../types/ChannelInventoryReconciliation";
import { InMemoryTransitionAuditLog } from "./InMemoryChannelSemanticModeTransitionStore";

/**
 * In-memory enable/disable with stale-pending supersession (domain tests).
 */
export class InMemoryChannelConnectionInventoryApplyStore
  implements IChannelConnectionInventoryApplyStore
{
  readonly auditLog: InMemoryTransitionAuditLog;

  constructor(
    private readonly connections: InMemoryChannelConnectionRepository,
    private readonly mappings: InMemoryChannelListingMappingRepository,
    private readonly cursors: InMemoryChannelPollCursorRepository,
    private readonly generations: Map<string, ChannelInventoryReconciliationRecord>,
    private readonly rotationStore: InMemoryIcalCredentialRotationStore | null = null,
    auditLog: InMemoryTransitionAuditLog = new InMemoryTransitionAuditLog(),
  ) {
    this.auditLog = auditLog;
  }

  async enable(
    command: ChannelConnectionInventoryApplyStoreCommand,
  ): Promise<EnableChannelConnectionInventoryApplyStoreResult> {
    const connection = await this.connections.findById(
      command.tenantId,
      command.connectionId,
    );
    if (!connection) {
      throw new ConflictError("Channel connection not found", "not_found");
    }
    if (connection.semanticConfigVersion !== command.expectedSemanticConfigVersion) {
      throw new ConflictError(
        "Channel connection semantic configuration version is stale",
        "semantic_version_conflict",
      );
    }

    const cursor = await this.cursors.getCursor(command.tenantId, command.connectionId);
    const committedCursorVersion = cursor?.version ?? null;
    let supersededPendingCount = 0;

    for (const generation of this.generations.values()) {
      if (
        generation.tenantId !== command.tenantId ||
        generation.connectionId !== command.connectionId ||
        generation.reconcileStatus !== "pending"
      ) {
        continue;
      }
      const stale =
        committedCursorVersion === null ||
        generation.cursorVersion < committedCursorVersion;
      if (stale) {
        generation.reconcileStatus = "superseded";
        supersededPendingCount += 1;
      }
    }

    if (connection.inventoryApplyEnabled) {
      return {
        inventoryApplyEnabled: true,
        alreadyEnabled: true,
        semanticConfigVersion: connection.semanticConfigVersion,
        supersededPendingCount,
      };
    }

    if (connection.status !== "active") {
      throw new ConflictError(
        `Enable requires active connection, found: ${connection.status}`,
        "connection_not_active",
      );
    }
    if (connection.provider !== "ical") {
      throw new ConflictError("Enable requires provider ical", "provider_not_ical");
    }
    if (connection.semanticMode !== "availability_block_feed") {
      throw new ConflictError(
        "Enable requires semanticMode availability_block_feed",
        "semantic_mode_invalid",
      );
    }
    if (connection.credentialRef == null) {
      throw new ConflictError("Enable requires credentialRef", "credential_missing");
    }

    const listed = await this.mappings.listByConnection(
      command.tenantId,
      command.connectionId,
    );
    const active = listed.filter((m) => m.status === "active");
    if (active.length !== 1) {
      throw new ConflictError(
        `Enable requires exactly one active mapping, found ${active.length}`,
        "active_mapping_count_invalid",
      );
    }
    const mapping = active[0]!;
    if (mapping.propertyId.trim().length === 0 || mapping.unitId.trim().length === 0) {
      throw new ConflictError("Active mapping propertyId/unitId incomplete", "mapping_incomplete");
    }

    if (this.rotationStore) {
      const rotation = await this.rotationStore.findInProgressForConnection(
        command.tenantId,
        command.connectionId,
      );
      if (rotation) {
        throw new ConflictError(
          "Cannot enable inventory apply while credential rotation is in progress",
          "rotation_in_progress",
        );
      }
    }

    connection.setInventoryApplyEnabled(true);
    await this.connections.setInventoryApplyEnabledForTests(
      command.tenantId,
      command.connectionId,
      true,
    );

    await this.auditLog.append({
      tenantId: command.tenantId,
      actorId: command.actorId,
      action: "channel.connection.inventory_apply_enabled",
      resourceType: "ChannelConnection",
      resourceId: command.connectionId,
      metadata: {
        semanticConfigVersion: connection.semanticConfigVersion,
        supersededPendingCount,
        alreadyEnabled: false,
        committedCursorVersion,
      },
      ipAddress: command.ipAddress,
    });

    return {
      inventoryApplyEnabled: true,
      alreadyEnabled: false,
      semanticConfigVersion: connection.semanticConfigVersion,
      supersededPendingCount,
    };
  }

  async disable(
    command: ChannelConnectionInventoryApplyStoreCommand,
  ): Promise<DisableChannelConnectionInventoryApplyStoreResult> {
    const connection = await this.connections.findById(
      command.tenantId,
      command.connectionId,
    );
    if (!connection) {
      throw new ConflictError("Channel connection not found", "not_found");
    }
    if (connection.semanticConfigVersion !== command.expectedSemanticConfigVersion) {
      throw new ConflictError(
        "Channel connection semantic configuration version is stale",
        "semantic_version_conflict",
      );
    }

    if (!connection.inventoryApplyEnabled) {
      return {
        inventoryApplyEnabled: false,
        alreadyDisabled: true,
        semanticConfigVersion: connection.semanticConfigVersion,
      };
    }

    await this.connections.setInventoryApplyEnabledForTests(
      command.tenantId,
      command.connectionId,
      false,
    );

    await this.auditLog.append({
      tenantId: command.tenantId,
      actorId: command.actorId,
      action: "channel.connection.inventory_apply_disabled",
      resourceType: "ChannelConnection",
      resourceId: command.connectionId,
      metadata: {
        semanticConfigVersion: connection.semanticConfigVersion,
        alreadyDisabled: false,
      },
      ipAddress: command.ipAddress,
    });

    return {
      inventoryApplyEnabled: false,
      alreadyDisabled: false,
      semanticConfigVersion: connection.semanticConfigVersion,
    };
  }
}
