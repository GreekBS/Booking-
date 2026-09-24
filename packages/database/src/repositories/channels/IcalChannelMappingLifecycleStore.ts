import {
  ConflictError,
  NotFoundError,
  EMPTY_ICAL_CURSOR_BASELINE_PAYLOAD,
  parseFeedSemanticMode,
  type IcalMappingLifecycleMutationParams,
  type IcalMappingLifecycleMutationResult,
  type IIcalChannelMappingLifecycleStore,
} from "@hcp/domain";
import type { Prisma } from "@prisma/client";
import {
  prisma,
  withTenantTransaction,
  type PrismaTransactionClient,
} from "../../client";
import { PrismaChannelConnectionRepository } from "./ChannelConnectionRepository";
import { PrismaChannelListingMappingRepository } from "./ChannelListingMappingRepository";
import { PrismaChannelPollCursorRepository } from "./ChannelPollCursorRepository";

type DbClient = typeof prisma | PrismaTransactionClient;

export type IcalChannelMappingLifecycleTransactionOptions = {
  maxWait?: number;
  timeout?: number;
};

interface LockedConnectionRow {
  status: string;
  provider: string;
  semantic_mode: string;
  semantic_config_version: number;
}

interface LockedMappingRow {
  id: string;
  status: string;
}

/**
 * PostgreSQL iCal mapping lifecycle store (P1-S6c).
 *
 * One short transaction per mutation with the S6b lock order preserved:
 * setTenantContext → ChannelConnection FOR UPDATE → ChannelListingMapping
 * FOR UPDATE → pending ChannelInventoryReconciliation FOR UPDATE.
 *
 * When the semantic epoch bumps, active `channel_import` rows from superseded
 * epochs are soft-released. Hold/Booking inventory is never touched.
 */
export class PrismaIcalChannelMappingLifecycleStore
  implements IIcalChannelMappingLifecycleStore
{
  constructor(
    private readonly client: DbClient = prisma,
    private readonly transactionOptions?: IcalChannelMappingLifecycleTransactionOptions,
  ) {}

  async mutateUnderConnectionLock(
    params: IcalMappingLifecycleMutationParams,
  ): Promise<IcalMappingLifecycleMutationResult> {
    return withTenantTransaction(
      params.tenantId,
      (tx) => this.runInTransaction(tx, params),
      this.transactionOptions,
    );
  }

  private async runInTransaction(
    tx: PrismaTransactionClient,
    params: IcalMappingLifecycleMutationParams,
  ): Promise<IcalMappingLifecycleMutationResult> {
    const connection = await this.lockConnection(
      tx,
      params.tenantId,
      params.connectionId,
    );
    if (connection.provider !== "ical") {
      throw new ConflictError(
        "iCal mapping lifecycle is only supported for iCal connections",
        "provider_mismatch",
      );
    }
    if (
      !(params.allowedConnectionStatuses as readonly string[]).includes(
        connection.status,
      )
    ) {
      throw new ConflictError(
        `Cannot mutate listing mapping while connection is ${connection.status}`,
        "lifecycle_status_conflict",
      );
    }
    if (connection.semantic_config_version !== params.expectedSemanticConfigVersion) {
      throw new ConflictError(
        "ChannelConnection semantic configuration version is stale",
        "semantic_epoch_conflict",
      );
    }

    const lockedMappings = await this.lockMappings(
      tx,
      params.tenantId,
      params.connectionId,
    );

    const projected = new Map(lockedMappings.map((row) => [row.id, row.status]));
    if (params.deactivatedMapping) {
      projected.set(params.deactivatedMapping.id, params.deactivatedMapping.status);
    }
    if (params.mapping) {
      projected.set(params.mapping.id, params.mapping.status);
    }
    const activeMappingCount = [...projected.values()].filter(
      (status) => status === "active",
    ).length;
    if (connection.semantic_mode === "availability_block_feed" && activeMappingCount > 1) {
      throw new ConflictError(
        `iCal availability_block_feed connection must have at most one active listing mapping, found ${activeMappingCount}`,
        "mapping_count_invalid",
      );
    }

    const mappingRepo = new PrismaChannelListingMappingRepository(tx);
    if (params.deactivatedMapping) {
      await mappingRepo.saveAssumingConnectionLocked(tx, params.deactivatedMapping);
    }
    if (params.mapping) {
      await mappingRepo.saveAssumingConnectionLocked(tx, params.mapping);
    }

    const now = params.now ?? new Date();
    const previousSemanticConfigVersion = connection.semantic_config_version;
    let resultingSemanticConfigVersion = previousSemanticConfigVersion;
    let cursorBaselineReset = false;
    let retainedCursorVersion: number | null = null;
    let supersededPendingCount = 0;
    let releasedSupersededImportedInventoryCount = 0;

    if (params.requiresEpochBump) {
      await tx.$queryRaw`
        SELECT "cursor_version"
        FROM "channel_inventory_reconciliations"
        WHERE "tenant_id" = ${params.tenantId}::uuid
          AND "connection_id" = ${params.connectionId}
          AND "reconcile_status" = 'pending'::"ChannelInventoryReconcileStatus"
        FOR UPDATE
      `;

      resultingSemanticConfigVersion = previousSemanticConfigVersion + 1;
      const connectionRepo = new PrismaChannelConnectionRepository(tx);
      await connectionRepo.persistSemanticState({
        tenantId: params.tenantId,
        connectionId: params.connectionId,
        expectedSemanticConfigVersion: previousSemanticConfigVersion,
        semanticMode: parseFeedSemanticMode(connection.semantic_mode),
        semanticConfigVersion: resultingSemanticConfigVersion,
        updatedAt: now,
      });

      const cursorRepo = new PrismaChannelPollCursorRepository(tx);
      // Keep baseline reset on the same interactive TX (connection already locked).
      const baseline = await cursorRepo.resetPollCursorBaseline({
        tenantId: params.tenantId,
        connectionId: params.connectionId,
        semanticConfigVersion: resultingSemanticConfigVersion,
        baselinePayload: EMPTY_ICAL_CURSOR_BASELINE_PAYLOAD,
      });
      cursorBaselineReset = baseline.cursorRowUpdated;
      retainedCursorVersion = baseline.retainedVersion;

      const superseded = await tx.channelInventoryReconciliation.updateMany({
        where: {
          tenantId: params.tenantId,
          connectionId: params.connectionId,
          reconcileStatus: "pending",
        },
        data: { reconcileStatus: "superseded" },
      });
      supersededPendingCount = superseded.count;

      const releasedOldEpoch = await tx.$queryRaw<Array<{ id: string }>>`
        UPDATE "unit_calendar_blocks"
        SET
          "status" = 'released'::"CalendarBlockStatus",
          "updated_at" = NOW()
        WHERE "tenant_id" = ${params.tenantId}::uuid
          AND "connection_id" = ${params.connectionId}
          AND "block_type" = 'channel_import'::"CalendarBlockType"
          AND "status" = 'active'::"CalendarBlockStatus"
          AND "semantic_config_version" IS NOT NULL
          AND "semantic_config_version" < ${resultingSemanticConfigVersion}
        RETURNING "id"
      `;
      releasedSupersededImportedInventoryCount = releasedOldEpoch.length;
    }

    await tx.auditLog.create({
      data: {
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
          releasedSupersededImportedInventoryCount,
          reason: params.reason ?? null,
        } as Prisma.InputJsonValue,
        ipAddress: params.ipAddress ?? null,
      },
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

  private async lockConnection(
    tx: PrismaTransactionClient,
    tenantId: string,
    connectionId: string,
  ): Promise<LockedConnectionRow> {
    const rows = await tx.$queryRaw<LockedConnectionRow[]>`
      SELECT
        "status"::text AS "status",
        "provider",
        "semantic_mode"::text AS "semantic_mode",
        "semantic_config_version"
      FROM "channel_connections"
      WHERE "tenant_id" = ${tenantId}::uuid
        AND "id" = ${connectionId}
      FOR UPDATE
    `;
    const row = rows[0];
    if (!row) {
      throw new NotFoundError("ChannelConnection", connectionId);
    }
    return row;
  }

  private async lockMappings(
    tx: PrismaTransactionClient,
    tenantId: string,
    connectionId: string,
  ): Promise<LockedMappingRow[]> {
    return tx.$queryRaw<LockedMappingRow[]>`
      SELECT "id", "status"::text AS "status"
      FROM "channel_listing_mappings"
      WHERE "tenant_id" = ${tenantId}::uuid
        AND "connection_id" = ${connectionId}
      FOR UPDATE
    `;
  }
}
