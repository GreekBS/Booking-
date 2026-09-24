import {
  ConflictError,
  NotFoundError,
  ValidationError,
  hydrateChannelPollCursor,
  nextChannelPollCursorVersion,
  type AdvanceChannelPollCursorParams,
  type ChannelPollCursor,
  type IChannelPollCursorRepository,
  type ResetPollCursorBaselineParams,
  type ResetPollCursorBaselineResult,
} from "@hcp/domain";
import type { PrismaClient } from "@prisma/client";
import {
  prisma,
  withTenantTransaction,
  type PrismaTransactionClient,
} from "../../client";

type CursorDatabaseClient = PrismaClient | PrismaTransactionClient;

interface LockedConnectionRow {
  semantic_config_version: number;
}

interface LockedCursorRow {
  tenant_id: string;
  connection_id: string;
  payload: string;
  version: number;
  semantic_config_version: number;
  updated_at: Date;
}

function validateAdvanceParams(params: AdvanceChannelPollCursorParams): void {
  if (
    !Number.isInteger(params.observedSemanticConfigVersion) ||
    params.observedSemanticConfigVersion < 1
  ) {
    throw new ValidationError("observedSemanticConfigVersion must be a positive integer");
  }
  if (
    !Number.isInteger(params.expectedCursorVersion) ||
    params.expectedCursorVersion < 0
  ) {
    throw new ValidationError("expectedCursorVersion must be a non-negative integer");
  }
}

export class PrismaChannelPollCursorRepository implements IChannelPollCursorRepository {
  constructor(
    private readonly client: CursorDatabaseClient = prisma,
    private readonly transactionOptions?: { maxWait?: number; timeout?: number },
  ) {}

  async getCursor(
    tenantId: string,
    connectionId: string,
  ): Promise<ChannelPollCursor | null> {
    return this.withTransaction(tenantId, async (tx) => {
      const record = await tx.channelPollCursor.findUnique({
        where: { tenantId_connectionId: { tenantId, connectionId } },
      });
      return record ? hydrateChannelPollCursor(record) : null;
    });
  }

  async advanceCursor(
    params: AdvanceChannelPollCursorParams,
  ): Promise<ChannelPollCursor> {
    validateAdvanceParams(params);

    return this.withTransaction(params.tenantId, async (tx) => {
      const connection = await this.lockConnection(
        tx,
        params.tenantId,
        params.connectionId,
      );
      if (
        connection.semantic_config_version !==
        params.observedSemanticConfigVersion
      ) {
        throw new ConflictError("Channel poll cursor semantic epoch is stale");
      }

      const current = await this.lockCursor(
        tx,
        params.tenantId,
        params.connectionId,
      );
      const maxRecon = await this.maxReconciliationCursorVersion(
        tx,
        params.tenantId,
        params.connectionId,
      );

      if (!current) {
        if (params.expectedCursorVersion !== 0) {
          throw new ConflictError("Channel poll cursor version is stale");
        }

        const version = nextChannelPollCursorVersion(0, maxRecon);
        const created = await tx.channelPollCursor.create({
          data: {
            tenantId: params.tenantId,
            connectionId: params.connectionId,
            payload: params.nextPayload,
            version,
            semanticConfigVersion: params.observedSemanticConfigVersion,
          },
        });
        return hydrateChannelPollCursor(created);
      }

      if (
        current.version !== params.expectedCursorVersion ||
        current.semantic_config_version !==
          params.observedSemanticConfigVersion
      ) {
        throw new ConflictError(
          "Channel poll cursor version or semantic epoch is stale",
        );
      }

      const version = nextChannelPollCursorVersion(current.version, maxRecon);
      const updated = await tx.channelPollCursor.update({
        where: {
          tenantId_connectionId: {
            tenantId: params.tenantId,
            connectionId: params.connectionId,
          },
        },
        data: {
          payload: params.nextPayload,
          version,
          semanticConfigVersion: params.observedSemanticConfigVersion,
        },
      });
      return hydrateChannelPollCursor(updated);
    });
  }

  async resetPollCursorBaseline(
    params: ResetPollCursorBaselineParams,
  ): Promise<ResetPollCursorBaselineResult> {
    if (
      !Number.isInteger(params.semanticConfigVersion) ||
      params.semanticConfigVersion < 1
    ) {
      throw new ValidationError("semanticConfigVersion must be a positive integer");
    }
    if (typeof params.baselinePayload !== "string" || params.baselinePayload.length === 0) {
      throw new ValidationError("baselinePayload must be a non-empty string");
    }

    return this.withTransaction(params.tenantId, async (tx) => {
      await this.lockConnection(tx, params.tenantId, params.connectionId);
      const current = await this.lockCursor(
        tx,
        params.tenantId,
        params.connectionId,
      );
      if (!current) {
        return { cursorRowUpdated: false, retainedVersion: null };
      }

      await tx.channelPollCursor.update({
        where: {
          tenantId_connectionId: {
            tenantId: params.tenantId,
            connectionId: params.connectionId,
          },
        },
        data: {
          payload: params.baselinePayload,
          semanticConfigVersion: params.semanticConfigVersion,
          // version intentionally retained
        },
      });
      return { cursorRowUpdated: true, retainedVersion: current.version };
    });
  }

  private async withTransaction<T>(
    tenantId: string,
    operation: (tx: PrismaTransactionClient) => Promise<T>,
  ): Promise<T> {
    return withTenantTransaction(tenantId, operation, this.transactionOptions);
  }

  private async lockConnection(
    tx: PrismaTransactionClient,
    tenantId: string,
    connectionId: string,
  ): Promise<LockedConnectionRow> {
    const rows = await tx.$queryRaw<LockedConnectionRow[]>`
      SELECT "semantic_config_version"
      FROM "channel_connections"
      WHERE "tenant_id" = ${tenantId}::uuid
        AND "id" = ${connectionId}
      FOR UPDATE
    `;
    const connection = rows[0];
    if (!connection) {
      throw new NotFoundError("ChannelConnection", connectionId);
    }
    return connection;
  }

  private async lockCursor(
    tx: PrismaTransactionClient,
    tenantId: string,
    connectionId: string,
  ): Promise<LockedCursorRow | null> {
    const rows = await tx.$queryRaw<LockedCursorRow[]>`
      SELECT
        "tenant_id",
        "connection_id",
        "payload",
        "version",
        "semantic_config_version",
        "updated_at"
      FROM "channel_poll_cursors"
      WHERE "tenant_id" = ${tenantId}::uuid
        AND "connection_id" = ${connectionId}
      FOR UPDATE
    `;
    return rows[0] ?? null;
  }

  private async maxReconciliationCursorVersion(
    tx: PrismaTransactionClient,
    tenantId: string,
    connectionId: string,
  ): Promise<number> {
    const rows = await tx.$queryRaw<Array<{ max_version: number | null }>>`
      SELECT MAX("cursor_version")::int AS max_version
      FROM "channel_inventory_reconciliations"
      WHERE "tenant_id" = ${tenantId}::uuid
        AND "connection_id" = ${connectionId}
    `;
    return rows[0]?.max_version ?? 0;
  }
}
