import {
  isChannelInventoryApplyEnabled,
  parseAuthoritativeObservedEvidence,
  projectDesiredChannelImportBlocks,
  shouldReleaseProviderIdentity,
  type ChannelInventoryApplyCommand,
  type ChannelInventoryApplyFailureCode,
  type ChannelInventoryApplyResult,
  type ChannelInventoryApplyTestHooks,
  type IChannelInventoryReconciliationApplyStore,
} from "@hcp/domain";
import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import {
  prisma,
  withTenantTransaction,
  type PrismaTransactionClient,
} from "../../client";

type DbClient = typeof prisma | PrismaTransactionClient;

interface LockedConnectionRow {
  id: string;
  status: string;
  provider: string;
  semantic_config_version: number;
  semantic_mode: string;
  inventory_apply_enabled: boolean;
}

interface LockedMappingRow {
  id: string;
  status: string;
  mapping_version: number;
  unit_id: string;
  property_id: string;
}

interface LockedGenerationRow {
  tenant_id: string;
  connection_id: string;
  cursor_version: number;
  semantic_config_version: number;
  mapping_id: string;
  mapping_version: number;
  unit_id: string;
  property_id: string;
  actionable_snapshot: unknown;
  complete_observed_evidence: boolean;
  observed_source_identity_keys: unknown;
  cancelled_source_identity_keys: unknown;
  reconcile_status: string;
  reconcile_error_code: string | null;
}

export type ChannelInventoryApplyTransactionOptions = {
  maxWait?: number;
  timeout?: number;
};

/**
 * P1-S6b TX2 — connection → mapping → reconciliation → channel_import upserts.
 * P1-S7a — same-epoch authoritative soft-release under complete observed evidence.
 * No cursor lock.
 */
export class PrismaChannelInventoryReconciliationApplyStore
  implements IChannelInventoryReconciliationApplyStore
{
  constructor(
    private readonly client: DbClient = prisma,
    private readonly hooks: ChannelInventoryApplyTestHooks = {},
    private readonly transactionOptions?: ChannelInventoryApplyTransactionOptions,
    private readonly applyEnabled: () => boolean = () => isChannelInventoryApplyEnabled(),
  ) {}

  async apply(command: ChannelInventoryApplyCommand): Promise<ChannelInventoryApplyResult> {
    try {
      return await withTenantTransaction(
        command.tenantId,
        (tx) => this.runInTransaction(tx, command),
        this.transactionOptions,
      );
    } catch (error) {
      if (this.isRetryable(error)) {
        return {
          ok: false,
          execution: "RETRY",
          code: "internal_error",
          message: error instanceof Error ? error.message : String(error),
          reconcileStatus: "pending",
          shouldRetryJob: true,
        };
      }
      throw error;
    }
  }

  private async runInTransaction(
    tx: PrismaTransactionClient,
    command: ChannelInventoryApplyCommand,
  ): Promise<ChannelInventoryApplyResult> {
    if (!this.applyEnabled()) {
      return {
        ok: true,
        execution: "DEFER",
        reconcileStatus: "pending",
        deferReason: "inventory_apply_disabled",
        desiredItemCount: 0,
        createdCount: 0,
        updatedCount: 0,
        retainedStaleCount: 0,
        deactivatedCount: 0,
      };
    }

    const connection = await this.lockConnection(tx, command.tenantId, command.connectionId);
    if (!connection) {
      return this.failPermanent(tx, command, "connection_not_found", "not_found");
    }

    // Live L2 fence under connection FOR UPDATE (do not trust enqueue-time state).
    if (connection.inventory_apply_enabled !== true) {
      return {
        ok: true,
        execution: "DEFER",
        reconcileStatus: "pending",
        deferReason: "inventory_apply_disabled",
        desiredItemCount: 0,
        createdCount: 0,
        updatedCount: 0,
        retainedStaleCount: 0,
        deactivatedCount: 0,
      };
    }

    // S6b lock order: connection → mappings → reconciliation → blocks.
    // Terminal generations must NOOP even while the connection is paused/non-active
    // (S6c: eagerly superseded work must not DEFER/retry).
    const mappings = await this.lockMappings(tx, command.tenantId, command.connectionId);
    const generation = await this.lockGeneration(
      tx,
      command.tenantId,
      command.connectionId,
      command.cursorVersion,
    );

    if (this.hooks.afterReconciliationLock) {
      await this.hooks.afterReconciliationLock();
    }

    if (!generation) {
      return this.failPermanent(
        tx,
        command,
        "invariant_corruption",
        "generation_not_found",
      );
    }

    if (generation.reconcile_status === "applied") {
      return this.noop("applied");
    }
    if (generation.reconcile_status === "superseded") {
      return this.noop("superseded");
    }
    if (generation.reconcile_status === "failed") {
      return this.noop("failed");
    }

    if (connection.status !== "active") {
      return {
        ok: true,
        execution: "DEFER",
        reconcileStatus: "pending",
        deferReason: "inactive_connection",
        desiredItemCount: 0,
        createdCount: 0,
        updatedCount: 0,
        retainedStaleCount: 0,
        deactivatedCount: 0,
      };
    }
    if (connection.provider !== "ical") {
      return this.failPermanent(tx, command, "provider_mismatch", "provider_mismatch");
    }
    if (connection.semantic_mode !== "availability_block_feed") {
      return this.failPermanent(
        tx,
        command,
        "feed_semantic_mode_not_availability_block",
        "feedSemanticMode must be availability_block_feed",
      );
    }

    if (
      (command.observedSemanticConfigVersion !== undefined &&
        command.observedSemanticConfigVersion !== generation.semantic_config_version) ||
      (command.observedMappingId !== undefined &&
        command.observedMappingId !== generation.mapping_id) ||
      (command.observedMappingVersion !== undefined &&
        command.observedMappingVersion !== generation.mapping_version)
    ) {
      return this.failPermanent(
        tx,
        command,
        "invariant_corruption",
        "observed_fence_mismatch",
      );
    }

    if (connection.semantic_config_version !== generation.semantic_config_version) {
      return this.supersede(tx, command);
    }

    const active = mappings.filter((m) => m.status === "active");
    if (active.length === 0 || active.length > 1) {
      return this.failPermanent(
        tx,
        command,
        "mapping_count_invalid",
        `expected exactly one active mapping, found ${active.length}`,
      );
    }
    const mapping = active[0]!;
    if (mapping.id !== generation.mapping_id) {
      return this.supersede(tx, command);
    }
    if (mapping.mapping_version !== generation.mapping_version) {
      return this.supersede(tx, command);
    }
    if (mapping.unit_id !== generation.unit_id) {
      return this.failPermanent(tx, command, "unit_id_mismatch", "unit_id_mismatch");
    }
    if (mapping.property_id !== generation.property_id) {
      return this.failPermanent(tx, command, "property_id_mismatch", "property_id_mismatch");
    }

    const newer = await tx.$queryRaw<Array<{ cursor_version: number }>>`
      SELECT "cursor_version"
      FROM "channel_inventory_reconciliations"
      WHERE "tenant_id" = ${command.tenantId}::uuid
        AND "connection_id" = ${command.connectionId}
        AND "cursor_version" > ${command.cursorVersion}
        AND "reconcile_status" IN (
          'pending'::"ChannelInventoryReconcileStatus",
          'applied'::"ChannelInventoryReconcileStatus"
        )
      LIMIT 1
    `;
    if (newer.length > 0) {
      return this.supersede(tx, command);
    }

    const projected = projectDesiredChannelImportBlocks(generation.actionable_snapshot);
    if (!projected.ok) {
      return this.failPermanent(tx, command, "invalid_snapshot", projected.message);
    }

    let createdCount = 0;
    let updatedCount = 0;
    let firstWrite = true;

    for (const desired of projected.blocks) {
      const id = randomUUID();
      const rows = await tx.$queryRaw<Array<{ id: string; inserted: boolean }>>`
        INSERT INTO "unit_calendar_blocks" (
          "id",
          "tenant_id",
          "unit_id",
          "property_id",
          "block_type",
          "source_id",
          "check_in",
          "check_out",
          "status",
          "connection_id",
          "semantic_config_version",
          "mapping_id",
          "source_identity_key",
          "entry_content_hash",
          "identity_kind",
          "created_at",
          "updated_at"
        ) VALUES (
          ${id}::uuid,
          ${command.tenantId}::uuid,
          ${generation.unit_id}::uuid,
          ${generation.property_id}::uuid,
          'channel_import'::"CalendarBlockType",
          NULL,
          ${desired.checkIn}::date,
          ${desired.checkOut}::date,
          'active'::"CalendarBlockStatus",
          ${command.connectionId},
          ${generation.semantic_config_version},
          ${generation.mapping_id},
          ${desired.sourceIdentityKey},
          ${desired.entryContentHash},
          ${desired.identityKind},
          NOW(),
          NOW()
        )
        ON CONFLICT (
          "tenant_id",
          "connection_id",
          "semantic_config_version",
          "mapping_id",
          "unit_id",
          "source_identity_key"
        )
        WHERE (
          "block_type" = 'channel_import'::"CalendarBlockType"
          AND "status" = 'active'::"CalendarBlockStatus"
        )
        DO UPDATE SET
          "check_in" = EXCLUDED."check_in",
          "check_out" = EXCLUDED."check_out",
          "property_id" = EXCLUDED."property_id",
          "entry_content_hash" = EXCLUDED."entry_content_hash",
          "identity_kind" = EXCLUDED."identity_kind",
          "updated_at" = NOW()
        RETURNING
          "id",
          (xmax = 0) AS "inserted"
      `;
      const row = rows[0];
      if (row?.inserted) {
        createdCount += 1;
      } else {
        updatedCount += 1;
      }
      if (firstWrite && this.hooks.afterFirstBlockWrite) {
        firstWrite = false;
        await this.hooks.afterFirstBlockWrite();
      }
    }

    const evidence = parseAuthoritativeObservedEvidence({
      completeObservedEvidence: generation.complete_observed_evidence,
      observedSourceIdentityKeys: generation.observed_source_identity_keys,
      cancelledSourceIdentityKeys: generation.cancelled_source_identity_keys,
    });

    const existingOwned = await tx.$queryRaw<
      Array<{ id: string; source_identity_key: string }>
    >`
      SELECT "id", "source_identity_key"
      FROM "unit_calendar_blocks"
      WHERE "tenant_id" = ${command.tenantId}::uuid
        AND "connection_id" = ${command.connectionId}
        AND "semantic_config_version" = ${generation.semantic_config_version}
        AND "mapping_id" = ${generation.mapping_id}
        AND "unit_id" = ${generation.unit_id}::uuid
        AND "block_type" = 'channel_import'::"CalendarBlockType"
        AND "status" = 'active'::"CalendarBlockStatus"
    `;

    let deactivatedCount = 0;
    if (evidence.completeObservedEvidence) {
      const releaseIds = existingOwned
        .filter((row) =>
          shouldReleaseProviderIdentity(row.source_identity_key, evidence),
        )
        .map((row) => row.id);
      if (releaseIds.length > 0) {
        const released = await tx.$queryRaw<Array<{ id: string }>>`
          UPDATE "unit_calendar_blocks"
          SET
            "status" = 'released'::"CalendarBlockStatus",
            "updated_at" = NOW()
          WHERE "id" IN (${Prisma.join(releaseIds.map((id) => Prisma.sql`${id}::uuid`))})
            AND "tenant_id" = ${command.tenantId}::uuid
            AND "block_type" = 'channel_import'::"CalendarBlockType"
            AND "status" = 'active'::"CalendarBlockStatus"
          RETURNING "id"
        `;
        deactivatedCount = released.length;
      }
    }

    const remainingOwned = await tx.$queryRaw<Array<{ source_identity_key: string }>>`
      SELECT "source_identity_key"
      FROM "unit_calendar_blocks"
      WHERE "tenant_id" = ${command.tenantId}::uuid
        AND "connection_id" = ${command.connectionId}
        AND "semantic_config_version" = ${generation.semantic_config_version}
        AND "mapping_id" = ${generation.mapping_id}
        AND "unit_id" = ${generation.unit_id}::uuid
        AND "block_type" = 'channel_import'::"CalendarBlockType"
        AND "status" = 'active'::"CalendarBlockStatus"
    `;
    const desiredKeys = new Set(projected.blocks.map((b) => b.sourceIdentityKey));
    const retainedStaleCount = remainingOwned.filter(
      (row) => !desiredKeys.has(row.source_identity_key),
    ).length;

    await tx.channelInventoryReconciliation.update({
      where: {
        tenantId_connectionId_cursorVersion: {
          tenantId: command.tenantId,
          connectionId: command.connectionId,
          cursorVersion: command.cursorVersion,
        },
      },
      data: {
        reconcileStatus: "applied",
        appliedAt: new Date(),
        reconcileErrorCode: null,
      },
    });

    await tx.channelInventoryReconciliation.updateMany({
      where: {
        tenantId: command.tenantId,
        connectionId: command.connectionId,
        cursorVersion: { lt: command.cursorVersion },
        reconcileStatus: "pending",
      },
      data: {
        reconcileStatus: "superseded",
      },
    });

    return {
      ok: true,
      execution: "APPLY",
      reconcileStatus: "applied",
      desiredItemCount: projected.blocks.length,
      createdCount,
      updatedCount,
      retainedStaleCount,
      deactivatedCount,
    };
  }

  private noop(
    status: "applied" | "superseded" | "failed",
  ): ChannelInventoryApplyResult {
    return {
      ok: true,
      execution: "NOOP",
      reconcileStatus: status,
      desiredItemCount: 0,
      createdCount: 0,
      updatedCount: 0,
      retainedStaleCount: 0,
      deactivatedCount: 0,
    };
  }

  private async supersede(
    tx: PrismaTransactionClient,
    command: ChannelInventoryApplyCommand,
  ): Promise<ChannelInventoryApplyResult> {
    await tx.channelInventoryReconciliation.update({
      where: {
        tenantId_connectionId_cursorVersion: {
          tenantId: command.tenantId,
          connectionId: command.connectionId,
          cursorVersion: command.cursorVersion,
        },
      },
      data: { reconcileStatus: "superseded" },
    });
    return {
      ok: true,
      execution: "SUPERSEDE",
      reconcileStatus: "superseded",
      desiredItemCount: 0,
      createdCount: 0,
      updatedCount: 0,
      retainedStaleCount: 0,
      deactivatedCount: 0,
    };
  }

  private async failPermanent(
    tx: PrismaTransactionClient,
    command: ChannelInventoryApplyCommand,
    code: ChannelInventoryApplyFailureCode,
    message: string,
    markFailed = true,
  ): Promise<ChannelInventoryApplyResult> {
    if (markFailed) {
      await tx.channelInventoryReconciliation.updateMany({
        where: {
          tenantId: command.tenantId,
          connectionId: command.connectionId,
          cursorVersion: command.cursorVersion,
          reconcileStatus: "pending",
        },
        data: {
          reconcileStatus: "failed",
          reconcileErrorCode: code,
        },
      });
    }
    return {
      ok: false,
      execution: "PERMANENT_FAIL",
      code,
      message,
      reconcileStatus: markFailed ? "failed" : "pending",
      shouldRetryJob: false,
    };
  }

  private isRetryable(error: unknown): boolean {
    if (!error || typeof error !== "object") {
      return false;
    }
    const code =
      "code" in error && typeof (error as { code: unknown }).code === "string"
        ? (error as { code: string }).code
        : "";
    // Prisma / PG deadlock & serialization
    return code === "P2034" || code === "40001" || code === "40P01";
  }

  private async lockConnection(
    tx: PrismaTransactionClient,
    tenantId: string,
    connectionId: string,
  ): Promise<LockedConnectionRow | null> {
    const rows = await tx.$queryRaw<LockedConnectionRow[]>`
      SELECT
        "id",
        "status"::text AS "status",
        "provider",
        "semantic_config_version",
        "semantic_mode"::text AS "semantic_mode",
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
        "mapping_version",
        "unit_id",
        "property_id"
      FROM "channel_listing_mappings"
      WHERE "tenant_id" = ${tenantId}::uuid
        AND "connection_id" = ${connectionId}
      FOR UPDATE
    `;
  }

  private async lockGeneration(
    tx: PrismaTransactionClient,
    tenantId: string,
    connectionId: string,
    cursorVersion: number,
  ): Promise<LockedGenerationRow | null> {
    const rows = await tx.$queryRaw<LockedGenerationRow[]>`
      SELECT
        "tenant_id",
        "connection_id",
        "cursor_version",
        "semantic_config_version",
        "mapping_id",
        "mapping_version",
        "unit_id",
        "property_id",
        "actionable_snapshot",
        "complete_observed_evidence",
        "observed_source_identity_keys",
        "cancelled_source_identity_keys",
        "reconcile_status"::text AS "reconcile_status",
        "reconcile_error_code"
      FROM "channel_inventory_reconciliations"
      WHERE "tenant_id" = ${tenantId}::uuid
        AND "connection_id" = ${connectionId}
        AND "cursor_version" = ${cursorVersion}
      FOR UPDATE
    `;
    return rows[0] ?? null;
  }
}
