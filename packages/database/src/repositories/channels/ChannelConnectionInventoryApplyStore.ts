import { ConflictError } from "@hcp/domain";
import type {
  ChannelConnectionInventoryApplyStoreCommand,
  DisableChannelConnectionInventoryApplyStoreResult,
  EnableChannelConnectionInventoryApplyStoreResult,
  IChannelConnectionInventoryApplyStore,
} from "@hcp/domain";
import { prisma, setTenantContext, type PrismaTransactionClient } from "../../client";

type LockedEnableConnectionRow = {
  id: string;
  status: string;
  provider: string;
  semantic_mode: string;
  semantic_config_version: number;
  credential_ref: string | null;
  inventory_apply_enabled: boolean;
};

type LockedMappingRow = {
  id: string;
  status: string;
  property_id: string;
  unit_id: string;
};

/**
 * P1-S7c — enable/disable under channel_connections FOR UPDATE.
 *
 * Enable ordering (same TX):
 * 1. lock connection
 * 2. read committed poll cursor
 * 3. supersede pending where cursor_version < committed (or all pending if no cursor)
 * 4. if already enabled → return (idempotent; stale work still cleaned)
 * 5. re-check lock-stable preconditions
 * 6. set inventory_apply_enabled=true
 * 7. audit
 *
 * Dead-letter / stuck-job health is pre-checked by the use case (not under this lock).
 */
export class PrismaChannelConnectionInventoryApplyStore
  implements IChannelConnectionInventoryApplyStore
{
  async enable(
    command: ChannelConnectionInventoryApplyStoreCommand,
  ): Promise<EnableChannelConnectionInventoryApplyStoreResult> {
    return prisma.$transaction(async (tx) => {
      await setTenantContext(tx, command.tenantId);
      return this.runEnable(tx, command);
    });
  }

  async disable(
    command: ChannelConnectionInventoryApplyStoreCommand,
  ): Promise<DisableChannelConnectionInventoryApplyStoreResult> {
    return prisma.$transaction(async (tx) => {
      await setTenantContext(tx, command.tenantId);
      return this.runDisable(tx, command);
    });
  }

  private async runEnable(
    tx: PrismaTransactionClient,
    command: ChannelConnectionInventoryApplyStoreCommand,
  ): Promise<EnableChannelConnectionInventoryApplyStoreResult> {
    const connection = await this.lockConnection(tx, command.tenantId, command.connectionId);
    if (!connection) {
      throw new ConflictError("Channel connection not found", "not_found");
    }
    if (connection.semantic_config_version !== command.expectedSemanticConfigVersion) {
      throw new ConflictError(
        "Channel connection semantic configuration version is stale",
        "semantic_version_conflict",
      );
    }

    // Lock order matches TX1: connection → mappings → cursor (avoids deadlock).
    const mappings = await this.lockMappings(tx, command.tenantId, command.connectionId);
    const cursorRows = await tx.$queryRaw<Array<{ version: number }>>`
      SELECT "version"
      FROM "channel_poll_cursors"
      WHERE "tenant_id" = ${command.tenantId}::uuid
        AND "connection_id" = ${command.connectionId}
      FOR UPDATE
    `;
    const committedCursorVersion = cursorRows[0]?.version ?? null;

    let supersededPendingCount = 0;
    if (committedCursorVersion === null) {
      // Fail-closed: without a committed cursor, no pending gen can be proven current.
      const superseded = await tx.$executeRaw`
        UPDATE "channel_inventory_reconciliations"
        SET
          "reconcile_status" = 'superseded'::"ChannelInventoryReconcileStatus",
          "reconcile_error_code" = NULL
        WHERE "tenant_id" = ${command.tenantId}::uuid
          AND "connection_id" = ${command.connectionId}
          AND "reconcile_status" = 'pending'::"ChannelInventoryReconcileStatus"
      `;
      supersededPendingCount = Number(superseded);
    } else {
      const superseded = await tx.$executeRaw`
        UPDATE "channel_inventory_reconciliations"
        SET
          "reconcile_status" = 'superseded'::"ChannelInventoryReconcileStatus",
          "reconcile_error_code" = NULL
        WHERE "tenant_id" = ${command.tenantId}::uuid
          AND "connection_id" = ${command.connectionId}
          AND "reconcile_status" = 'pending'::"ChannelInventoryReconcileStatus"
          AND "cursor_version" < ${committedCursorVersion}
      `;
      supersededPendingCount = Number(superseded);
    }

    if (connection.inventory_apply_enabled) {
      return {
        inventoryApplyEnabled: true,
        alreadyEnabled: true,
        semanticConfigVersion: connection.semantic_config_version,
        supersededPendingCount,
      };
    }

    this.assertEnablePreconditionsUnderLock(connection);

    const active = mappings.filter((m) => m.status === "active");
    if (active.length !== 1) {
      throw new ConflictError(
        `Enable requires exactly one active mapping, found ${active.length}`,
        "active_mapping_count_invalid",
      );
    }
    const mapping = active[0]!;
    if (mapping.property_id.trim().length === 0 || mapping.unit_id.trim().length === 0) {
      throw new ConflictError("Active mapping propertyId/unitId incomplete", "mapping_incomplete");
    }

    const rotation = await tx.$queryRaw<Array<{ command_id: string }>>`
      SELECT "command_id"
      FROM "channel_ical_credential_rotation_commands"
      WHERE "tenant_id" = ${command.tenantId}::uuid
        AND "connection_id" = ${command.connectionId}
        AND "status" = 'in_progress'::"ChannelIcalCredentialRotationStatus"
      LIMIT 1
    `;
    if (rotation.length > 0) {
      throw new ConflictError(
        "Cannot enable inventory apply while credential rotation is in progress",
        "rotation_in_progress",
      );
    }

    const updated = await tx.$executeRaw`
      UPDATE "channel_connections"
      SET
        "inventory_apply_enabled" = true,
        "updated_at" = NOW()
      WHERE "tenant_id" = ${command.tenantId}::uuid
        AND "id" = ${command.connectionId}
        AND "semantic_config_version" = ${command.expectedSemanticConfigVersion}
        AND "inventory_apply_enabled" = false
    `;
    if (updated !== 1) {
      throw new ConflictError(
        "Failed to enable connection inventory apply",
        "inventory_apply_enable_conflict",
      );
    }

    await tx.auditLog.create({
      data: {
        tenantId: command.tenantId,
        actorId: command.actorId,
        action: "channel.connection.inventory_apply_enabled",
        resourceType: "ChannelConnection",
        resourceId: command.connectionId,
        metadata: {
          semanticConfigVersion: connection.semantic_config_version,
          supersededPendingCount,
          alreadyEnabled: false,
          committedCursorVersion,
        },
        ipAddress: command.ipAddress,
      },
    });

    return {
      inventoryApplyEnabled: true,
      alreadyEnabled: false,
      semanticConfigVersion: connection.semantic_config_version,
      supersededPendingCount,
    };
  }

  private async runDisable(
    tx: PrismaTransactionClient,
    command: ChannelConnectionInventoryApplyStoreCommand,
  ): Promise<DisableChannelConnectionInventoryApplyStoreResult> {
    const connection = await this.lockConnection(tx, command.tenantId, command.connectionId);
    if (!connection) {
      throw new ConflictError("Channel connection not found", "not_found");
    }
    if (connection.semantic_config_version !== command.expectedSemanticConfigVersion) {
      throw new ConflictError(
        "Channel connection semantic configuration version is stale",
        "semantic_version_conflict",
      );
    }

    if (!connection.inventory_apply_enabled) {
      return {
        inventoryApplyEnabled: false,
        alreadyDisabled: true,
        semanticConfigVersion: connection.semantic_config_version,
      };
    }

    const updated = await tx.$executeRaw`
      UPDATE "channel_connections"
      SET
        "inventory_apply_enabled" = false,
        "updated_at" = NOW()
      WHERE "tenant_id" = ${command.tenantId}::uuid
        AND "id" = ${command.connectionId}
        AND "semantic_config_version" = ${command.expectedSemanticConfigVersion}
        AND "inventory_apply_enabled" = true
    `;
    if (updated !== 1) {
      throw new ConflictError(
        "Failed to disable connection inventory apply",
        "inventory_apply_disable_conflict",
      );
    }

    await tx.auditLog.create({
      data: {
        tenantId: command.tenantId,
        actorId: command.actorId,
        action: "channel.connection.inventory_apply_disabled",
        resourceType: "ChannelConnection",
        resourceId: command.connectionId,
        metadata: {
          semanticConfigVersion: connection.semantic_config_version,
          alreadyDisabled: false,
        },
        ipAddress: command.ipAddress,
      },
    });

    return {
      inventoryApplyEnabled: false,
      alreadyDisabled: false,
      semanticConfigVersion: connection.semantic_config_version,
    };
  }

  private assertEnablePreconditionsUnderLock(connection: LockedEnableConnectionRow): void {
    if (connection.status !== "active") {
      throw new ConflictError(
        `Enable requires active connection, found: ${connection.status}`,
        "connection_not_active",
      );
    }
    if (connection.provider !== "ical") {
      throw new ConflictError("Enable requires provider ical", "provider_not_ical");
    }
    if (connection.semantic_mode !== "availability_block_feed") {
      throw new ConflictError(
        "Enable requires semanticMode availability_block_feed",
        "semantic_mode_invalid",
      );
    }
    if (connection.credential_ref == null || connection.credential_ref.trim().length === 0) {
      throw new ConflictError("Enable requires credentialRef", "credential_missing");
    }
  }

  private async lockConnection(
    tx: PrismaTransactionClient,
    tenantId: string,
    connectionId: string,
  ): Promise<LockedEnableConnectionRow | null> {
    const rows = await tx.$queryRaw<LockedEnableConnectionRow[]>`
      SELECT
        "id",
        "status"::text AS "status",
        "provider",
        "semantic_mode"::text AS "semantic_mode",
        "semantic_config_version",
        "credential_ref",
        "inventory_apply_enabled"
      FROM "channel_connections"
      WHERE "tenant_id" = ${tenantId}::uuid
        AND "id" = ${connectionId}
      FOR UPDATE
    `;
    return rows[0] ?? null;
  }

  private async lockMappings(
    tx: PrismaTransactionClient,
    tenantId: string,
    connectionId: string,
  ): Promise<LockedMappingRow[]> {
    return tx.$queryRaw<LockedMappingRow[]>`
      SELECT
        "id",
        "status"::text AS "status",
        "property_id",
        "unit_id"
      FROM "channel_listing_mappings"
      WHERE "tenant_id" = ${tenantId}::uuid
        AND "connection_id" = ${connectionId}
      FOR UPDATE
    `;
  }
}
