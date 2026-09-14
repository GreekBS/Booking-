import {
  ConflictError,
  isChannelInventoryApplyEnabled,
  mapBatchToPollConnectionResult,
  buildIcalInventoryReconcileDeliveryKey,
  uuidFromSha256Hex,
  ICAL_INVENTORY_RECONCILE_AGGREGATE_TYPE,
  ICAL_INVENTORY_RECONCILE_OUTBOX_EVENT_TYPE,
  nextChannelPollCursorVersion,
  type ChannelPollInventoryCommitCommand,
  type ChannelPollInventoryCommitFailureCode,
  type ChannelPollInventoryCommitResult,
  type IChannelPollInventoryCommitStore,
} from "@hcp/domain";
import type { Prisma } from "@prisma/client";
import {
  prisma,
  setTenantContext,
  type PrismaTransactionClient,
} from "../../client";

type DbClient = typeof prisma | PrismaTransactionClient;

export type ChannelPollInventoryCommitTestHooks = {
  /** Invoked after connection lock, before mapping validation. */
  afterConnectionLock?: () => Promise<void>;
  /** Invoked after successful cursor CAS, before generation insert. */
  afterCursorCas?: () => Promise<void>;
  /** Invoked after generation insert, before outbox (pending only). */
  afterGenerationInsert?: () => Promise<void>;
};

export type ChannelPollInventoryCommitTransactionOptions = {
  maxWait?: number;
  timeout?: number;
};

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

interface LockedCursorRow {
  payload: string;
  version: number;
  semantic_config_version: number;
}

/**
 * P1-S6a TX1 — single PostgreSQL transaction:
 * connection lock → mapping validation → cursor CAS → generation → outbox (pending).
 * Does not mutate calendar inventory rows.
 */
export class PrismaChannelPollInventoryCommitStore
  implements IChannelPollInventoryCommitStore
{
  constructor(
    private readonly client: DbClient = prisma,
    private readonly hooks: ChannelPollInventoryCommitTestHooks = {},
    private readonly transactionOptions?: ChannelPollInventoryCommitTransactionOptions,
    private readonly applyEnabled: () => boolean = () => isChannelInventoryApplyEnabled(),
  ) {}

  async commit(
    command: ChannelPollInventoryCommitCommand,
  ): Promise<ChannelPollInventoryCommitResult> {
    if ("$transaction" in this.client) {
      try {
        return await this.client.$transaction(
          async (tx) => this.runInTransaction(tx, command),
          this.transactionOptions,
        );
      } catch (error) {
        if (error instanceof ConflictError) {
          return this.resolveConflictAfterRollback(command);
        }
        throw error;
      }
    }

    await setTenantContext(this.client, command.tenantId);
    return this.runInTransaction(this.client, command);
  }

  private async resolveConflictAfterRollback(
    command: ChannelPollInventoryCommitCommand,
  ): Promise<ChannelPollInventoryCommitResult> {
    await setTenantContext(prisma, command.tenantId);
    const reloaded = await prisma.channelPollCursor.findUnique({
      where: {
        tenantId_connectionId: {
          tenantId: command.tenantId,
          connectionId: command.connectionId,
        },
      },
    });
    if (
      reloaded &&
      reloaded.payload === command.proposedNextCursor &&
      reloaded.semanticConfigVersion === command.observedSemanticConfigVersion
    ) {
      // P1-S6a Finding B: already_committed must not permanently skip baseline generation
      // when apply is ON and no generation exists for the committed cursor version.
      if (this.applyEnabled()) {
        await this.ensureGenerationForCommittedCursor(command, reloaded.version);
      }
      return {
        ok: true,
        pollResult: mapBatchToPollConnectionResult(
          command.batch,
          command.loadedCursorVersion,
          "already_committed",
          false,
          false,
          "none",
          reloaded.version,
        ),
      };
    }
    return this.fail(
      command,
      "cursor_conflict",
      "cursor CAS conflict",
      "deferred_retry",
      true,
    );
  }

  /**
   * When CAS loses but cursor payload is already committed, ensure a generation
   * (+ outbox if pending) exists for that exact cursor version. Idempotent.
   */
  private async ensureGenerationForCommittedCursor(
    command: ChannelPollInventoryCommitCommand,
    cursorVersion: number,
  ): Promise<void> {
    if ("$transaction" in this.client) {
      await this.client.$transaction(
        async (tx) => this.runEnsureGeneration(tx, command, cursorVersion),
        this.transactionOptions,
      );
      return;
    }
    await setTenantContext(this.client, command.tenantId);
    await this.runEnsureGeneration(this.client, command, cursorVersion);
  }

  private async runEnsureGeneration(
    tx: PrismaTransactionClient,
    command: ChannelPollInventoryCommitCommand,
    cursorVersion: number,
  ): Promise<void> {
    await setTenantContext(tx, command.tenantId);

    const connection = await this.lockConnection(
      tx,
      command.tenantId,
      command.connectionId,
    );
    if (
      !connection ||
      connection.status !== "active" ||
      connection.provider !== "ical" ||
      connection.semantic_config_version !== command.observedSemanticConfigVersion ||
      connection.semantic_mode !== "availability_block_feed" ||
      connection.inventory_apply_enabled !== true
    ) {
      return;
    }

    const mappings = await this.lockMappings(tx, command.tenantId, command.connectionId);
    const active = mappings.filter((m) => m.status === "active");
    if (active.length !== 1) {
      return;
    }
    const mapping = active[0]!;

    const cursor = await this.lockCursor(tx, command.tenantId, command.connectionId);
    if (
      !cursor ||
      cursor.version !== cursorVersion ||
      cursor.payload !== command.proposedNextCursor ||
      cursor.semantic_config_version !== command.observedSemanticConfigVersion
    ) {
      return;
    }

    const existing = await tx.channelInventoryReconciliation.findUnique({
      where: {
        tenantId_connectionId_cursorVersion: {
          tenantId: command.tenantId,
          connectionId: command.connectionId,
          cursorVersion,
        },
      },
    });
    if (existing) {
      return;
    }

    // P1-S7a: even authoritative empty actionable sets stay pending + outbox so TX2
    // can soft-release owned actives under complete observed evidence.
    const now = new Date();
    const actionableSnapshot = JSON.parse(
      command.inventorySnapshot.canonicalJson,
    ) as Prisma.InputJsonValue;

    await tx.channelInventoryReconciliation.create({
      data: {
        tenantId: command.tenantId,
        connectionId: command.connectionId,
        cursorVersion,
        semanticConfigVersion: command.observedSemanticConfigVersion,
        mappingId: mapping.id,
        mappingVersion: mapping.mapping_version,
        unitId: mapping.unit_id,
        propertyId: mapping.property_id,
        snapshotHash: command.inventorySnapshot.snapshotHash,
        actionableSnapshot,
        completeObservedEvidence: command.inventorySnapshot.completeObservedEvidence === true,
        observedSourceIdentityKeys:
          command.inventorySnapshot.observedSourceIdentityKeys ?? [],
        cancelledSourceIdentityKeys:
          command.inventorySnapshot.cancelledSourceIdentityKeys ?? [],
        reconcileStatus: "pending",
        reconcileErrorCode: null,
        createdAt: now,
        appliedAt: null,
      },
    });

    const deliveryKey = buildIcalInventoryReconcileDeliveryKey({
      tenantId: command.tenantId,
      connectionId: command.connectionId,
      cursorVersion,
      semanticConfigVersion: command.observedSemanticConfigVersion,
      mappingId: mapping.id,
      mappingVersion: mapping.mapping_version,
    });
    const existingOutbox = await tx.outboxEvent.findFirst({
      where: {
        tenantId: command.tenantId,
        eventType: ICAL_INVENTORY_RECONCILE_OUTBOX_EVENT_TYPE,
        deliveryKey,
      },
    });
    if (!existingOutbox) {
      await tx.outboxEvent.create({
        data: {
          tenantId: command.tenantId,
          aggregateType: ICAL_INVENTORY_RECONCILE_AGGREGATE_TYPE,
          aggregateId: uuidFromSha256Hex(deliveryKey),
          eventType: ICAL_INVENTORY_RECONCILE_OUTBOX_EVENT_TYPE,
          payload: {
            connectionId: command.connectionId,
            cursorVersion,
            semanticConfigVersion: command.observedSemanticConfigVersion,
            mappingId: mapping.id,
            mappingVersion: mapping.mapping_version,
          },
          deliveryKey,
          status: "pending",
        },
      });
    }
  }

  private async runInTransaction(
    tx: PrismaTransactionClient,
    command: ChannelPollInventoryCommitCommand,
  ): Promise<ChannelPollInventoryCommitResult> {
    await setTenantContext(tx, command.tenantId);

    if (!this.applyEnabled()) {
      return this.fail(
        command,
        "inventory_apply_disabled",
        "CHANNELS_INVENTORY_APPLY_ENABLED is not true",
      );
    }

    const connection = await this.lockConnection(
      tx,
      command.tenantId,
      command.connectionId,
    );
    if (!connection) {
      return this.fail(command, "connection_not_found", "not_found");
    }
    if (connection.inventory_apply_enabled !== true) {
      return this.fail(
        command,
        "inventory_apply_disabled",
        "connection inventory apply is not enabled",
      );
    }
    if (connection.status !== "active") {
      return this.fail(command, "inactive_connection", "not_active");
    }
    if (connection.provider !== "ical" || command.provider !== "ical") {
      return this.fail(command, "provider_mismatch", "provider_mismatch");
    }
    if (connection.semantic_config_version !== command.observedSemanticConfigVersion) {
      return this.fail(
        command,
        "semantic_epoch_stale",
        "semantic epoch stale",
        "deferred_retry",
        true,
      );
    }
    if (connection.semantic_mode !== "availability_block_feed") {
      return this.fail(
        command,
        "feed_semantic_mode_not_availability_block",
        "feedSemanticMode must be availability_block_feed",
      );
    }

    if (this.hooks.afterConnectionLock) {
      await this.hooks.afterConnectionLock();
    }

    const mappings = await this.lockMappings(tx, command.tenantId, command.connectionId);
    const active = mappings.filter((m) => m.status === "active");
    if (active.length !== 1) {
      return this.fail(
        command,
        "mapping_count_invalid",
        `expected exactly one active mapping, found ${active.length}`,
      );
    }
    const mapping = active[0]!;

    const current = await this.lockCursor(tx, command.tenantId, command.connectionId);
    const maxReconRows = await tx.$queryRaw<Array<{ max_version: number | null }>>`
      SELECT MAX("cursor_version")::int AS max_version
      FROM "channel_inventory_reconciliations"
      WHERE "tenant_id" = ${command.tenantId}::uuid
        AND "connection_id" = ${command.connectionId}
    `;
    const maxRecon = maxReconRows[0]?.max_version ?? 0;
    let committedVersion: number;

    if (!current) {
      if (command.expectedCursorVersion !== 0) {
        throw new ConflictError("Channel poll cursor version is stale");
      }
      const version = nextChannelPollCursorVersion(0, maxRecon);
      const created = await tx.channelPollCursor.create({
        data: {
          tenantId: command.tenantId,
          connectionId: command.connectionId,
          payload: command.proposedNextCursor,
          version,
          semanticConfigVersion: command.observedSemanticConfigVersion,
        },
      });
      committedVersion = created.version;
    } else {
      if (
        current.version !== command.expectedCursorVersion ||
        current.semantic_config_version !== command.observedSemanticConfigVersion
      ) {
        throw new ConflictError("Channel poll cursor version or semantic epoch is stale");
      }
      const version = nextChannelPollCursorVersion(current.version, maxRecon);
      const updated = await tx.channelPollCursor.update({
        where: {
          tenantId_connectionId: {
            tenantId: command.tenantId,
            connectionId: command.connectionId,
          },
        },
        data: {
          payload: command.proposedNextCursor,
          version,
          semanticConfigVersion: command.observedSemanticConfigVersion,
        },
      });
      committedVersion = updated.version;
    }

    if (this.hooks.afterCursorCas) {
      await this.hooks.afterCursorCas();
    }

    // P1-S7a: empty actionable still pending + outbox (authoritative empty → TX2 release).
    const now = new Date();
    const actionableSnapshot = JSON.parse(
      command.inventorySnapshot.canonicalJson,
    ) as Prisma.InputJsonValue;

    await tx.channelInventoryReconciliation.create({
      data: {
        tenantId: command.tenantId,
        connectionId: command.connectionId,
        cursorVersion: committedVersion,
        semanticConfigVersion: command.observedSemanticConfigVersion,
        mappingId: mapping.id,
        mappingVersion: mapping.mapping_version,
        unitId: mapping.unit_id,
        propertyId: mapping.property_id,
        snapshotHash: command.inventorySnapshot.snapshotHash,
        actionableSnapshot,
        completeObservedEvidence: command.inventorySnapshot.completeObservedEvidence === true,
        observedSourceIdentityKeys:
          command.inventorySnapshot.observedSourceIdentityKeys ?? [],
        cancelledSourceIdentityKeys:
          command.inventorySnapshot.cancelledSourceIdentityKeys ?? [],
        reconcileStatus: "pending",
        reconcileErrorCode: null,
        createdAt: now,
        appliedAt: null,
      },
    });

    if (this.hooks.afterGenerationInsert) {
      await this.hooks.afterGenerationInsert();
    }

    const deliveryKey = buildIcalInventoryReconcileDeliveryKey({
      tenantId: command.tenantId,
      connectionId: command.connectionId,
      cursorVersion: committedVersion,
      semanticConfigVersion: command.observedSemanticConfigVersion,
      mappingId: mapping.id,
      mappingVersion: mapping.mapping_version,
    });
    await tx.outboxEvent.create({
      data: {
        tenantId: command.tenantId,
        aggregateType: ICAL_INVENTORY_RECONCILE_AGGREGATE_TYPE,
        aggregateId: uuidFromSha256Hex(deliveryKey),
        eventType: ICAL_INVENTORY_RECONCILE_OUTBOX_EVENT_TYPE,
        payload: {
          connectionId: command.connectionId,
          cursorVersion: committedVersion,
          semanticConfigVersion: command.observedSemanticConfigVersion,
          mappingId: mapping.id,
          mappingVersion: mapping.mapping_version,
        },
        deliveryKey,
        status: "pending",
      },
    });

    return {
      ok: true,
      pollResult: mapBatchToPollConnectionResult(
        command.batch,
        command.loadedCursorVersion,
        "advanced",
        true,
        false,
        "none",
        committedVersion,
      ),
    };
  }

  private fail(
    command: ChannelPollInventoryCommitCommand,
    code: ChannelPollInventoryCommitFailureCode,
    message: string,
    reconciliation: "not_applicable" | "deferred_retry" = "not_applicable",
    shouldRetry = false,
  ): ChannelPollInventoryCommitResult {
    return {
      ok: false,
      code,
      message,
      pollResult: mapBatchToPollConnectionResult(
        command.batch,
        command.loadedCursorVersion,
        reconciliation,
        false,
        shouldRetry,
        shouldRetry ? "transient" : "none",
        null,
      ),
    };
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

  private async lockCursor(
    tx: PrismaTransactionClient,
    tenantId: string,
    connectionId: string,
  ): Promise<LockedCursorRow | null> {
    const rows = await tx.$queryRaw<LockedCursorRow[]>`
      SELECT
        "payload",
        "version",
        "semantic_config_version"
      FROM "channel_poll_cursors"
      WHERE "tenant_id" = ${tenantId}::uuid
        AND "connection_id" = ${connectionId}
      FOR UPDATE
    `;
    return rows[0] ?? null;
  }
}
