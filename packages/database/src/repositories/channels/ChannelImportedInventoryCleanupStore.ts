import { ConflictError } from "@hcp/domain";
import type {
  ChannelImportedInventoryCleanupResult,
  IChannelImportedInventoryCleanupStore,
  ReleaseAllChannelImportedInventoryCommand,
  ReleaseSupersededEpochChannelImportedInventoryCommand,
} from "@hcp/domain";
import { withTenantTransaction, type PrismaTransactionClient } from "../../client";

const RELEASE_ALLOWED = new Set(["active", "paused", "error", "disconnected"]);

/**
 * Releases connection-owned active `channel_import` blocks only.
 * Hold / Booking / other connections are never touched.
 */
export class PrismaChannelImportedInventoryCleanupStore
  implements IChannelImportedInventoryCleanupStore
{
  async releaseAllForConnection(
    command: ReleaseAllChannelImportedInventoryCommand,
  ): Promise<ChannelImportedInventoryCleanupResult> {
    return withTenantTransaction(command.tenantId, async (tx) => {
      const connection = await this.lockAndCas(
        tx,
        command.tenantId,
        command.connectionId,
        command.expectedSemanticConfigVersion,
      );
      const released = await this.releaseRows(
        tx,
        command.tenantId,
        command.connectionId,
        null,
      );
      await tx.auditLog.create({
        data: {
          tenantId: command.tenantId,
          actorId: command.actorId,
          action: "channel.connection.imported_inventory_released",
          resourceType: "ChannelConnection",
          resourceId: command.connectionId,
          metadata: {
            reason: command.reason,
            mode: "all_epochs",
            releasedCount: released.length,
            semanticConfigVersion: connection.semantic_config_version,
          },
          ipAddress: command.ipAddress ?? null,
        },
      });
      return {
        releasedCount: released.length,
        semanticConfigVersion: connection.semantic_config_version,
      };
    });
  }

  async releaseSupersededEpochs(
    command: ReleaseSupersededEpochChannelImportedInventoryCommand,
  ): Promise<ChannelImportedInventoryCleanupResult> {
    return withTenantTransaction(command.tenantId, async (tx) => {
      const connection = await this.lockAndCas(
        tx,
        command.tenantId,
        command.connectionId,
        command.expectedSemanticConfigVersion,
      );
      if (connection.semantic_config_version !== command.keepFromSemanticConfigVersion) {
        throw new ConflictError(
          "keepFromSemanticConfigVersion must match live connection epoch",
          "semantic_version_conflict",
        );
      }
      const released = await this.releaseRows(
        tx,
        command.tenantId,
        command.connectionId,
        command.keepFromSemanticConfigVersion,
      );
      await tx.auditLog.create({
        data: {
          tenantId: command.tenantId,
          actorId: command.actorId,
          action: "channel.connection.imported_inventory_released",
          resourceType: "ChannelConnection",
          resourceId: command.connectionId,
          metadata: {
            reason: command.reason,
            mode: "superseded_epochs",
            keepFromSemanticConfigVersion: command.keepFromSemanticConfigVersion,
            releasedCount: released.length,
            semanticConfigVersion: connection.semantic_config_version,
          },
          ipAddress: command.ipAddress ?? null,
        },
      });
      return {
        releasedCount: released.length,
        semanticConfigVersion: connection.semantic_config_version,
      };
    });
  }

  /**
   * TX-scoped helper for rotation / mapping epoch bumps that already hold the
   * connection lock. Does not re-lock or re-CAS.
   */
  async releaseSupersededEpochsAssumingConnectionLocked(
    tx: PrismaTransactionClient,
    params: {
      tenantId: string;
      connectionId: string;
      keepFromSemanticConfigVersion: number;
    },
  ): Promise<number> {
    const released = await this.releaseRows(
      tx,
      params.tenantId,
      params.connectionId,
      params.keepFromSemanticConfigVersion,
    );
    return released.length;
  }

  /**
   * TX-scoped helper for disconnect that already holds the connection lock.
   */
  async releaseAllAssumingConnectionLocked(
    tx: PrismaTransactionClient,
    params: { tenantId: string; connectionId: string },
  ): Promise<number> {
    const released = await this.releaseRows(
      tx,
      params.tenantId,
      params.connectionId,
      null,
    );
    return released.length;
  }

  private async lockAndCas(
    tx: PrismaTransactionClient,
    tenantId: string,
    connectionId: string,
    expectedSemanticConfigVersion: number,
  ): Promise<{ semantic_config_version: number; status: string }> {
    const locked = await tx.$queryRaw<
      Array<{ semantic_config_version: number; status: string }>
    >`
      SELECT
        "semantic_config_version",
        "status"::text AS "status"
      FROM "channel_connections"
      WHERE "tenant_id" = ${tenantId}::uuid
        AND "id" = ${connectionId}
      FOR UPDATE
    `;
    const connection = locked[0];
    if (!connection) {
      throw new ConflictError("Channel connection not found", "not_found");
    }
    if (connection.semantic_config_version !== expectedSemanticConfigVersion) {
      throw new ConflictError(
        "Channel connection semantic configuration version is stale",
        "semantic_version_conflict",
      );
    }
    if (!RELEASE_ALLOWED.has(connection.status)) {
      throw new ConflictError(
        `Cannot release imported inventory for connection in status: ${connection.status}`,
        "lifecycle_status_conflict",
      );
    }
    return connection;
  }

  private async releaseRows(
    tx: PrismaTransactionClient,
    tenantId: string,
    connectionId: string,
    keepFromSemanticConfigVersion: number | null,
  ): Promise<Array<{ id: string }>> {
    if (keepFromSemanticConfigVersion == null) {
      return tx.$queryRaw<Array<{ id: string }>>`
        UPDATE "unit_calendar_blocks"
        SET
          "status" = 'released'::"CalendarBlockStatus",
          "updated_at" = NOW()
        WHERE "tenant_id" = ${tenantId}::uuid
          AND "connection_id" = ${connectionId}
          AND "block_type" = 'channel_import'::"CalendarBlockType"
          AND "status" = 'active'::"CalendarBlockStatus"
        RETURNING "id"
      `;
    }

    return tx.$queryRaw<Array<{ id: string }>>`
      UPDATE "unit_calendar_blocks"
      SET
        "status" = 'released'::"CalendarBlockStatus",
        "updated_at" = NOW()
      WHERE "tenant_id" = ${tenantId}::uuid
        AND "connection_id" = ${connectionId}
        AND "block_type" = 'channel_import'::"CalendarBlockType"
        AND "status" = 'active'::"CalendarBlockStatus"
        AND "semantic_config_version" IS NOT NULL
        AND "semantic_config_version" < ${keepFromSemanticConfigVersion}
      RETURNING "id"
    `;
  }
}
