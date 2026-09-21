import {
  ConflictError,
  CredentialReference,
  IdempotencyConflictError,
  NotFoundError,
  PersistenceCorruptionError,
  ValidationError,
  CHANNEL_ICAL_CREDENTIAL_ROTATION_OPERATION,
  EMPTY_ICAL_CURSOR_BASELINE_PAYLOAD,
  isIcalCredentialRotationFailureReasonCode,
  isIcalCredentialRotationStatus,
  type ChannelConnection,
  type IcalCredentialRotationCommandRecord,
  type IcalCredentialRotationFailureReasonCode,
  type IcalCredentialRotationMarkFailedParams,
  type IcalCredentialRotationMarkVaultWrittenParams,
  type IcalCredentialRotationPhase1Params,
  type IcalCredentialRotationPhase1Result,
  type IcalCredentialRotationPhase3Params,
  type IcalCredentialRotationPhase3Result,
  type IcalCredentialRotationTestHooks,
  type IIcalCredentialRotationStore,
} from "@hcp/domain";
import { Prisma } from "@prisma/client";
import {
  prisma,
  setTenantContext,
  type PrismaTransactionClient,
} from "../../client";
import { PrismaChannelConnectionRepository } from "./ChannelConnectionRepository";

type DbClient = typeof prisma | PrismaTransactionClient;

export type IcalCredentialRotationTransactionOptions = {
  maxWait?: number;
  timeout?: number;
};

interface RotationRow {
  tenant_id: string;
  operation: string;
  command_id: string;
  connection_id: string;
  actor_id: string;
  expected_semantic_config_version: number | null;
  request_fingerprint: string;
  status: string;
  previous_credential_ref: string | null;
  new_credential_ref: string | null;
  previous_semantic_config_version: number | null;
  resulting_semantic_config_version: number | null;
  superseded_pending_count: number | null;
  cursor_baseline_reset: boolean | null;
  created_at: Date;
  vault_written_at: Date | null;
  committed_at: Date | null;
  failed_at: Date | null;
  failure_reason_code: string | null;
}

const ROTATION_COLUMNS = Prisma.sql`
  "tenant_id",
  "operation",
  "command_id",
  "connection_id",
  "actor_id",
  "expected_semantic_config_version",
  "request_fingerprint",
  "status"::text AS status,
  "previous_credential_ref",
  "new_credential_ref",
  "previous_semantic_config_version",
  "resulting_semantic_config_version",
  "superseded_pending_count",
  "cursor_baseline_reset",
  "created_at",
  "vault_written_at",
  "committed_at",
  "failed_at",
  "failure_reason_code"
`;

/**
 * PostgreSQL iCal credential rotation store (P1-S6c).
 *
 * Phase 1 lock order: setTenantContext → ChannelConnection FOR UPDATE →
 * rotation receipt (insert or FOR UPDATE) → lifecycle pause CAS.
 *
 * Phase 3 lock order (S6b order preserved): setTenantContext →
 * ChannelConnection FOR UPDATE → ChannelListingMapping FOR UPDATE → pending
 * ChannelInventoryReconciliation FOR UPDATE → rotation receipt FOR UPDATE.
 * No `unit_calendar_blocks` mutation; V1 never removes materialized blocks.
 *
 * Vault I/O never happens inside these transactions.
 */
export class PrismaIcalCredentialRotationStore implements IIcalCredentialRotationStore {
  constructor(
    private readonly client: DbClient = prisma,
    private readonly hooks: IcalCredentialRotationTestHooks = {},
    private readonly transactionOptions?: IcalCredentialRotationTransactionOptions,
  ) {}

  async phase1PauseAndClaimCommand(
    params: IcalCredentialRotationPhase1Params,
  ): Promise<IcalCredentialRotationPhase1Result> {
    assertFingerprint(params.requestFingerprint);
    return this.runInTransaction(params.tenantId, async (tx) => {
      const connectionRepo = new PrismaChannelConnectionRepository(tx);
      const connection = await this.lockRotatableConnection(
        tx,
        connectionRepo,
        params.tenantId,
        params.connectionId,
      );

      if (
        params.expectedSemanticConfigVersion != null &&
        connection.semanticConfigVersion !== params.expectedSemanticConfigVersion
      ) {
        throw new ConflictError(
          "ChannelConnection semantic configuration version is stale",
          "semantic_epoch_conflict",
        );
      }

      const existing = await this.lockReceipt(tx, params.tenantId, params.commandId);
      if (existing) {
        if (existing.request_fingerprint !== params.requestFingerprint) {
          throw new IdempotencyConflictError(
            "Credential rotation command fingerprint conflicts with an existing receipt",
          );
        }
        if (existing.connection_id !== params.connectionId) {
          throw new IdempotencyConflictError(
            "Credential rotation command belongs to a different connection",
          );
        }
        const status = parseStatus(existing.status);
        if (status === "failed" || status === "abandoned") {
          throw new ConflictError(
            `Credential rotation command is terminal: ${status}`,
            "rotation_command_terminal",
          );
        }
      } else {
        const inFlight = await this.lockInProgressForConnection(
          tx,
          params.tenantId,
          params.connectionId,
        );
        if (inFlight && inFlight.command_id !== params.commandId) {
          throw new ConflictError(
            "Another credential rotation is already in progress for this connection",
            "rotation_in_progress",
          );
        }
      }

      const now = params.now ?? new Date();
      const priorStatus = connection.status;
      let pausedNow = false;
      if (priorStatus === "active") {
        connection.pause(now);
        await connectionRepo.pauseWithExpectedSemanticVersion(
          connection,
          connection.semanticConfigVersion,
          priorStatus,
        );
        pausedNow = true;
      }

      const row =
        existing ??
        (await this.insertReceipt(tx, params, connection.credentialRef?.value ?? null, now));

      await this.hooks.afterPhase1Claim?.();

      return {
        command: hydrate(row),
        claimed: existing == null,
        pausedNow,
        priorStatus,
        semanticConfigVersion: connection.semanticConfigVersion,
        previousCredentialRef: row.previous_credential_ref,
      };
    });
  }

  async markVaultWritten(
    params: IcalCredentialRotationMarkVaultWrittenParams,
  ): Promise<IcalCredentialRotationCommandRecord> {
    if (typeof params.newCredentialRef !== "string" || params.newCredentialRef.length === 0) {
      throw new ValidationError("newCredentialRef is required");
    }
    return this.runInTransaction(params.tenantId, async (tx) => {
      const existing = await this.requireInProgress(
        tx,
        params.tenantId,
        params.connectionId,
        params.commandId,
      );
      if (
        existing.new_credential_ref != null &&
        existing.new_credential_ref !== params.newCredentialRef
      ) {
        throw new ConflictError(
          "Credential rotation receipt already references a different sealed credential",
        );
      }

      const rows = await tx.$queryRaw<RotationRow[]>`
        UPDATE "channel_ical_credential_rotation_commands"
        SET "new_credential_ref" = ${params.newCredentialRef},
            "vault_written_at" = ${params.now ?? new Date()}
        WHERE "tenant_id" = ${params.tenantId}::uuid
          AND "operation" = ${CHANNEL_ICAL_CREDENTIAL_ROTATION_OPERATION}
          AND "command_id" = ${params.commandId}
          AND "status" = 'in_progress'::"ChannelIcalCredentialRotationStatus"
        RETURNING ${ROTATION_COLUMNS}
      `;
      const row = rows[0];
      if (!row) {
        throw new ConflictError("Credential rotation receipt is no longer in progress");
      }
      return hydrate(row);
    });
  }

  async phase3CommitEpoch(
    params: IcalCredentialRotationPhase3Params,
  ): Promise<IcalCredentialRotationPhase3Result> {
    return this.runInTransaction(params.tenantId, async (tx) => {
      const connectionRepo = new PrismaChannelConnectionRepository(tx);

      const connection = await this.lockRotatableConnection(
        tx,
        connectionRepo,
        params.tenantId,
        params.connectionId,
      );

      // S6b lock order: connection → mappings → reconciliation → blocks.
      await tx.$queryRaw`
        SELECT "id"
        FROM "channel_listing_mappings"
        WHERE "tenant_id" = ${params.tenantId}::uuid
          AND "connection_id" = ${params.connectionId}
        FOR UPDATE
      `;
      await tx.$queryRaw`
        SELECT "cursor_version"
        FROM "channel_inventory_reconciliations"
        WHERE "tenant_id" = ${params.tenantId}::uuid
          AND "connection_id" = ${params.connectionId}
          AND "reconcile_status" = 'pending'::"ChannelInventoryReconcileStatus"
        FOR UPDATE
      `;

      const receipt = await this.lockReceipt(tx, params.tenantId, params.commandId);
      if (!receipt) {
        throw new NotFoundError(
          "ChannelIcalCredentialRotationCommand",
          params.commandId,
        );
      }
      const status = parseStatus(receipt.status);
      if (status === "committed") {
        return hydrateCommittedResult(receipt, true);
      }
      if (status !== "in_progress") {
        throw new ConflictError(
          `Credential rotation command is terminal: ${status}`,
          "rotation_command_terminal",
        );
      }
      if (receipt.connection_id !== params.connectionId) {
        throw new ConflictError("Credential rotation receipt connection mismatch");
      }
      if (receipt.new_credential_ref !== params.newCredentialRef) {
        throw new ConflictError(
          "Credential rotation receipt does not reference the supplied sealed credential",
        );
      }
      if (connection.status !== "paused") {
        throw new ConflictError(
          `Credential rotation commit requires a paused connection, found: ${connection.status}`,
          "lifecycle_status_conflict",
        );
      }
      if (
        receipt.expected_semantic_config_version != null &&
        connection.semanticConfigVersion !== receipt.expected_semantic_config_version
      ) {
        throw new ConflictError(
          "ChannelConnection semantic configuration version is stale",
          "semantic_epoch_conflict",
        );
      }

      const now = params.now ?? new Date();
      const previousVersion = connection.semanticConfigVersion;
      const resultingVersion = previousVersion + 1;

      connection.replaceCredentialReference(
        CredentialReference.create(params.newCredentialRef),
      );
      await connectionRepo.saveNonSemanticChanges(connection);
      await this.hooks.afterCredentialReplace?.();

      await connectionRepo.persistSemanticState({
        tenantId: params.tenantId,
        connectionId: params.connectionId,
        expectedSemanticConfigVersion: previousVersion,
        semanticMode: connection.semanticMode,
        semanticConfigVersion: resultingVersion,
        updatedAt: now,
      });
      await this.hooks.afterEpochBump?.();

      // Baseline reset under the already-held connection lock (do not open a
      // nested interactive transaction via PrismaChannelPollCursorRepository).
      const lockedCursor = await tx.$queryRaw<Array<{ version: number }>>`
        SELECT "version"
        FROM "channel_poll_cursors"
        WHERE "tenant_id" = ${params.tenantId}::uuid
          AND "connection_id" = ${params.connectionId}
        FOR UPDATE
      `;
      let cursorRowUpdated = false;
      let retainedVersion: number | null = null;
      if (lockedCursor[0]) {
        retainedVersion = lockedCursor[0].version;
        await tx.channelPollCursor.update({
          where: {
            tenantId_connectionId: {
              tenantId: params.tenantId,
              connectionId: params.connectionId,
            },
          },
          data: {
            payload: EMPTY_ICAL_CURSOR_BASELINE_PAYLOAD,
            semanticConfigVersion: resultingVersion,
          },
        });
        cursorRowUpdated = true;
      }
      await this.hooks.afterCursorBaselineReset?.();

      const superseded = await tx.channelInventoryReconciliation.updateMany({
        where: {
          tenantId: params.tenantId,
          connectionId: params.connectionId,
          reconcileStatus: "pending",
        },
        data: { reconcileStatus: "superseded" },
      });
      await this.hooks.afterSupersede?.();

      // Release active channel_import blocks from superseded epochs only.
      // Newer-epoch rows and Hold/Booking inventory are never touched.
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
          AND "semantic_config_version" < ${resultingVersion}
        RETURNING "id"
      `;

      await tx.auditLog.create({
        data: {
          tenantId: params.tenantId,
          actorId: params.actorId,
          action: "channel.connection.ical_credentials_rotated",
          resourceType: "ChannelConnection",
          resourceId: params.connectionId,
          metadata: {
            commandId: params.commandId,
            operation: CHANNEL_ICAL_CREDENTIAL_ROTATION_OPERATION,
            previousSemanticConfigVersion: previousVersion,
            resultingSemanticConfigVersion: resultingVersion,
            cursorBaselineReset: cursorRowUpdated,
            retainedCursorVersion: retainedVersion,
            supersededPendingCount: superseded.count,
            releasedSupersededImportedInventoryCount: releasedOldEpoch.length,
            credentialRefRotated: true,
            reason: params.reason ?? null,
          } as Prisma.InputJsonValue,
          ipAddress: params.ipAddress ?? null,
        },
      });

      await this.hooks.beforeReceiptCommit?.();

      const committedRows = await tx.$queryRaw<RotationRow[]>`
        UPDATE "channel_ical_credential_rotation_commands"
        SET "status" = 'committed'::"ChannelIcalCredentialRotationStatus",
            "previous_semantic_config_version" = ${previousVersion},
            "resulting_semantic_config_version" = ${resultingVersion},
            "superseded_pending_count" = ${superseded.count},
            "cursor_baseline_reset" = ${cursorRowUpdated},
            "committed_at" = ${now}
        WHERE "tenant_id" = ${params.tenantId}::uuid
          AND "operation" = ${CHANNEL_ICAL_CREDENTIAL_ROTATION_OPERATION}
          AND "command_id" = ${params.commandId}
          AND "status" = 'in_progress'::"ChannelIcalCredentialRotationStatus"
        RETURNING ${ROTATION_COLUMNS}
      `;
      const committed = committedRows[0];
      if (!committed) {
        throw new ConflictError("Credential rotation receipt is no longer in progress");
      }

      return {
        command: hydrate(committed),
        replayed: false,
        previousSemanticConfigVersion: previousVersion,
        resultingSemanticConfigVersion: resultingVersion,
        supersededPendingCount: superseded.count,
        cursorBaselineReset: cursorRowUpdated,
        retainedCursorVersion: retainedVersion,
        previousCredentialRef: committed.previous_credential_ref,
        committedAt: now,
      };
    });
  }

  async markFailed(
    params: IcalCredentialRotationMarkFailedParams,
  ): Promise<IcalCredentialRotationCommandRecord> {
    if (!isIcalCredentialRotationFailureReasonCode(params.reasonCode)) {
      throw new ValidationError(
        `Unsupported rotation failure reason code: ${String(params.reasonCode)}`,
      );
    }
    const nextStatus =
      params.reasonCode === "operator_abandoned" ? "abandoned" : "failed";

    return this.runInTransaction(params.tenantId, async (tx) => {
      await this.requireInProgress(
        tx,
        params.tenantId,
        params.connectionId,
        params.commandId,
      );
      const rows = await tx.$queryRaw<RotationRow[]>`
        UPDATE "channel_ical_credential_rotation_commands"
        SET "status" = ${nextStatus}::"ChannelIcalCredentialRotationStatus",
            "failed_at" = ${params.now ?? new Date()},
            "failure_reason_code" = ${params.reasonCode}
        WHERE "tenant_id" = ${params.tenantId}::uuid
          AND "operation" = ${CHANNEL_ICAL_CREDENTIAL_ROTATION_OPERATION}
          AND "command_id" = ${params.commandId}
          AND "status" = 'in_progress'::"ChannelIcalCredentialRotationStatus"
        RETURNING ${ROTATION_COLUMNS}
      `;
      const row = rows[0];
      if (!row) {
        throw new ConflictError("Credential rotation receipt is no longer in progress");
      }
      return hydrate(row);
    });
  }

  async findCommand(
    tenantId: string,
    commandId: string,
  ): Promise<IcalCredentialRotationCommandRecord | null> {
    return this.runInTransaction(tenantId, async (tx) => {
      const rows = await tx.$queryRaw<RotationRow[]>`
        SELECT ${ROTATION_COLUMNS}
        FROM "channel_ical_credential_rotation_commands"
        WHERE "tenant_id" = ${tenantId}::uuid
          AND "operation" = ${CHANNEL_ICAL_CREDENTIAL_ROTATION_OPERATION}
          AND "command_id" = ${commandId}
      `;
      return rows[0] ? hydrate(rows[0]) : null;
    });
  }

  async findInProgressForConnection(
    tenantId: string,
    connectionId: string,
  ): Promise<IcalCredentialRotationCommandRecord | null> {
    return this.runInTransaction(tenantId, async (tx) => {
      const rows = await tx.$queryRaw<RotationRow[]>`
        SELECT ${ROTATION_COLUMNS}
        FROM "channel_ical_credential_rotation_commands"
        WHERE "tenant_id" = ${tenantId}::uuid
          AND "connection_id" = ${connectionId}
          AND "status" = 'in_progress'::"ChannelIcalCredentialRotationStatus"
        ORDER BY "created_at" ASC
        LIMIT 1
      `;
      return rows[0] ? hydrate(rows[0]) : null;
    });
  }

  private async runInTransaction<T>(
    tenantId: string,
    operation: (tx: PrismaTransactionClient) => Promise<T>,
  ): Promise<T> {
    if ("$transaction" in this.client) {
      return this.client.$transaction(async (tx) => {
        await setTenantContext(tx, tenantId);
        return operation(tx);
      }, this.transactionOptions);
    }
    await setTenantContext(this.client, tenantId);
    return operation(this.client);
  }

  private async lockRotatableConnection(
    tx: PrismaTransactionClient,
    connectionRepo: PrismaChannelConnectionRepository,
    tenantId: string,
    connectionId: string,
  ): Promise<ChannelConnection> {
    const locked = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id"
      FROM "channel_connections"
      WHERE "tenant_id" = ${tenantId}::uuid
        AND "id" = ${connectionId}
      FOR UPDATE
    `;
    if (!locked[0]) {
      throw new NotFoundError("ChannelConnection", connectionId);
    }

    const connection = await connectionRepo.findById(tenantId, connectionId);
    if (!connection) {
      throw new NotFoundError("ChannelConnection", connectionId);
    }
    if (connection.provider !== "ical") {
      throw new ConflictError(
        "Credential rotation is only supported for iCal connections",
        "provider_mismatch",
      );
    }
    if (connection.status !== "active" && connection.status !== "paused") {
      throw new ConflictError(
        `Cannot rotate credentials for connection in status: ${connection.status}`,
        "lifecycle_status_conflict",
      );
    }
    return connection;
  }

  private async lockReceipt(
    tx: PrismaTransactionClient,
    tenantId: string,
    commandId: string,
  ): Promise<RotationRow | null> {
    const rows = await tx.$queryRaw<RotationRow[]>`
      SELECT ${ROTATION_COLUMNS}
      FROM "channel_ical_credential_rotation_commands"
      WHERE "tenant_id" = ${tenantId}::uuid
        AND "operation" = ${CHANNEL_ICAL_CREDENTIAL_ROTATION_OPERATION}
        AND "command_id" = ${commandId}
      FOR UPDATE
    `;
    return rows[0] ?? null;
  }

  private async lockInProgressForConnection(
    tx: PrismaTransactionClient,
    tenantId: string,
    connectionId: string,
  ): Promise<RotationRow | null> {
    const rows = await tx.$queryRaw<RotationRow[]>`
      SELECT ${ROTATION_COLUMNS}
      FROM "channel_ical_credential_rotation_commands"
      WHERE "tenant_id" = ${tenantId}::uuid
        AND "connection_id" = ${connectionId}
        AND "status" = 'in_progress'::"ChannelIcalCredentialRotationStatus"
      FOR UPDATE
    `;
    return rows[0] ?? null;
  }

  private async requireInProgress(
    tx: PrismaTransactionClient,
    tenantId: string,
    connectionId: string,
    commandId: string,
  ): Promise<RotationRow> {
    const row = await this.lockReceipt(tx, tenantId, commandId);
    if (!row) {
      throw new NotFoundError("ChannelIcalCredentialRotationCommand", commandId);
    }
    if (row.connection_id !== connectionId) {
      throw new ConflictError("Credential rotation receipt connection mismatch");
    }
    const status = parseStatus(row.status);
    if (status !== "in_progress") {
      throw new ConflictError(
        `Credential rotation command is not in progress: ${status}`,
        "rotation_command_terminal",
      );
    }
    return row;
  }

  private async insertReceipt(
    tx: PrismaTransactionClient,
    params: IcalCredentialRotationPhase1Params,
    previousCredentialRef: string | null,
    now: Date,
  ): Promise<RotationRow> {
    const rows = await tx.$queryRaw<RotationRow[]>`
      INSERT INTO "channel_ical_credential_rotation_commands" (
        "tenant_id",
        "operation",
        "command_id",
        "connection_id",
        "actor_id",
        "expected_semantic_config_version",
        "request_fingerprint",
        "status",
        "previous_credential_ref",
        "created_at"
      ) VALUES (
        ${params.tenantId}::uuid,
        ${CHANNEL_ICAL_CREDENTIAL_ROTATION_OPERATION},
        ${params.commandId},
        ${params.connectionId},
        ${params.actorId}::uuid,
        ${params.expectedSemanticConfigVersion ?? null},
        ${params.requestFingerprint},
        'in_progress'::"ChannelIcalCredentialRotationStatus",
        ${previousCredentialRef},
        ${now}
      )
      RETURNING ${ROTATION_COLUMNS}
    `;
    const row = rows[0];
    if (!row) {
      throw new ConflictError(
        "Credential rotation receipt could not be claimed; retry",
      );
    }
    return row;
  }
}

function assertFingerprint(fingerprint: string): void {
  if (typeof fingerprint !== "string" || !/^[0-9a-f]{64}$/.test(fingerprint)) {
    throw new ValidationError("requestFingerprint must be a 64-character hex digest");
  }
}

function parseStatus(value: string) {
  if (!isIcalCredentialRotationStatus(value)) {
    throw new PersistenceCorruptionError(
      `Invalid credential rotation status: ${String(value)}`,
    );
  }
  return value;
}

function parseFailureReasonCode(
  value: string | null,
): IcalCredentialRotationFailureReasonCode | null {
  if (value == null) {
    return null;
  }
  if (!isIcalCredentialRotationFailureReasonCode(value)) {
    throw new PersistenceCorruptionError(
      `Invalid credential rotation failure reason code: ${String(value)}`,
    );
  }
  return value;
}

function hydrate(row: RotationRow): IcalCredentialRotationCommandRecord {
  if (row.operation !== CHANNEL_ICAL_CREDENTIAL_ROTATION_OPERATION) {
    throw new PersistenceCorruptionError(
      `Unexpected credential rotation operation: ${row.operation}`,
    );
  }
  return {
    tenantId: row.tenant_id,
    operation: CHANNEL_ICAL_CREDENTIAL_ROTATION_OPERATION,
    commandId: row.command_id,
    connectionId: row.connection_id,
    actorId: row.actor_id,
    expectedSemanticConfigVersion: row.expected_semantic_config_version,
    requestFingerprint: row.request_fingerprint,
    status: parseStatus(row.status),
    previousCredentialRef: row.previous_credential_ref,
    newCredentialRef: row.new_credential_ref,
    previousSemanticConfigVersion: row.previous_semantic_config_version,
    resultingSemanticConfigVersion: row.resulting_semantic_config_version,
    supersededPendingCount: row.superseded_pending_count,
    cursorBaselineReset: row.cursor_baseline_reset,
    createdAt: new Date(row.created_at),
    vaultWrittenAt: row.vault_written_at ? new Date(row.vault_written_at) : null,
    committedAt: row.committed_at ? new Date(row.committed_at) : null,
    failedAt: row.failed_at ? new Date(row.failed_at) : null,
    failureReasonCode: parseFailureReasonCode(row.failure_reason_code),
  };
}

function hydrateCommittedResult(
  row: RotationRow,
  replayed: boolean,
): IcalCredentialRotationPhase3Result {
  if (
    row.previous_semantic_config_version == null ||
    row.resulting_semantic_config_version == null ||
    row.committed_at == null
  ) {
    throw new PersistenceCorruptionError(
      "Committed credential rotation receipt is missing required result fields",
    );
  }
  return {
    command: hydrate(row),
    replayed,
    previousSemanticConfigVersion: row.previous_semantic_config_version,
    resultingSemanticConfigVersion: row.resulting_semantic_config_version,
    supersededPendingCount: row.superseded_pending_count ?? 0,
    cursorBaselineReset: row.cursor_baseline_reset ?? false,
    retainedCursorVersion: null,
    previousCredentialRef: row.previous_credential_ref,
    committedAt: new Date(row.committed_at),
  };
}
