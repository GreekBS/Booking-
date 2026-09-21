import { ConflictError } from "@hcp/domain";
import type {
  DeactivateChannelConnectionInventoryStoreCommand,
  DeactivateChannelConnectionInventoryStoreResult,
  IDeactivateChannelConnectionInventoryStore,
} from "@hcp/domain";
import { prisma, setTenantContext, type PrismaTransactionClient } from "../../client";

/**
 * P1-S7b — connection FOR UPDATE → pause if active → release all owned active channel_import → audit.
 */
export class PrismaDeactivateChannelConnectionInventoryStore
  implements IDeactivateChannelConnectionInventoryStore
{
  async deactivate(
    command: DeactivateChannelConnectionInventoryStoreCommand,
  ): Promise<DeactivateChannelConnectionInventoryStoreResult> {
    return prisma.$transaction(async (tx) => {
      await setTenantContext(tx, command.tenantId);
      return this.run(tx, command);
    });
  }

  private async run(
    tx: PrismaTransactionClient,
    command: DeactivateChannelConnectionInventoryStoreCommand,
  ): Promise<DeactivateChannelConnectionInventoryStoreResult> {
    const locked = await tx.$queryRaw<
      Array<{
        id: string;
        status: string;
        semantic_config_version: number;
      }>
    >`
      SELECT
        "id",
        "status"::text AS "status",
        "semantic_config_version"
      FROM "channel_connections"
      WHERE "tenant_id" = ${command.tenantId}::uuid
        AND "id" = ${command.connectionId}
      FOR UPDATE
    `;
    const connection = locked[0];
    if (!connection) {
      throw new ConflictError("Channel connection not found", "not_found");
    }
    if (connection.semantic_config_version !== command.expectedSemanticConfigVersion) {
      throw new ConflictError(
        "Channel connection semantic configuration version is stale",
        "semantic_version_conflict",
      );
    }
    if (
      connection.status !== "active" &&
      connection.status !== "paused" &&
      connection.status !== "disconnected"
    ) {
      throw new ConflictError(
        `Cannot deactivate inventory for connection in status: ${connection.status}`,
        "lifecycle_status_conflict",
      );
    }

    const alreadyPaused =
      connection.status === "paused" || connection.status === "disconnected";
    if (connection.status === "active") {
      const updated = await tx.$executeRaw`
        UPDATE "channel_connections"
        SET
          "status" = 'paused'::"ChannelConnectionStatus",
          "updated_at" = NOW()
        WHERE "tenant_id" = ${command.tenantId}::uuid
          AND "id" = ${command.connectionId}
          AND "status" = 'active'::"ChannelConnectionStatus"
          AND "semantic_config_version" = ${command.expectedSemanticConfigVersion}
      `;
      if (updated !== 1) {
        throw new ConflictError(
          "Failed to pause connection for inventory deactivate",
          "lifecycle_status_conflict",
        );
      }
    }

    const released = await tx.$queryRaw<Array<{ id: string }>>`
      UPDATE "unit_calendar_blocks"
      SET
        "status" = 'released'::"CalendarBlockStatus",
        "updated_at" = NOW()
      WHERE "tenant_id" = ${command.tenantId}::uuid
        AND "connection_id" = ${command.connectionId}
        AND "block_type" = 'channel_import'::"CalendarBlockType"
        AND "status" = 'active'::"CalendarBlockStatus"
      RETURNING "id"
    `;

    await tx.auditLog.create({
      data: {
        tenantId: command.tenantId,
        actorId: command.actorId,
        action: "channel.connection.inventory_deactivated",
        resourceType: "ChannelConnection",
        resourceId: command.connectionId,
        metadata: {
          releasedCount: released.length,
          alreadyPaused,
          pausedByRollback: !alreadyPaused,
          semanticConfigVersion: connection.semantic_config_version,
        },
        ipAddress: command.ipAddress,
      },
    });

    return {
      releasedCount: released.length,
      alreadyPaused,
      semanticConfigVersion: connection.semantic_config_version,
    };
  }
}
