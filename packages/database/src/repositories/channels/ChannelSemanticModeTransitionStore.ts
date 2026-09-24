import {
  ConflictError,
  IdempotencyConflictError,
  NotFoundError,
  PersistenceCorruptionError,
  ValidationError,
  CHANNEL_SEMANTIC_MODE_TRANSITION_OPERATION,
  fingerprintSemanticModeTransitionCommand,
  parseFeedSemanticMode,
  parseSemanticConfigVersion,
  assertFeedSemanticModeAllowed,
  EMPTY_ICAL_CURSOR_BASELINE_PAYLOAD,
  type IChannelSemanticModeTransitionStore,
  type SemanticModeTransitionCommand,
  type SemanticModeTransitionResult,
  type SemanticModeTransitionTestHooks,
} from "@hcp/domain";
import type { Prisma } from "@prisma/client";
import {
  prisma,
  withTenantTransaction,
  type PrismaTransactionClient,
} from "../../client";
import { PrismaChannelPollCursorRepository } from "./ChannelPollCursorRepository";
import { PrismaChannelConnectionRepository } from "./ChannelConnectionRepository";

type DbClient = typeof prisma | PrismaTransactionClient;

interface ReceiptRow {
  tenant_id: string;
  operation: string;
  command_id: string;
  connection_id: string;
  actor_id: string;
  expected_from_mode: string;
  target_mode: string;
  expected_semantic_config_version: number;
  request_fingerprint: string;
  status: "pending" | "committed";
  previous_semantic_config_version: number | null;
  resulting_semantic_config_version: number | null;
  changed: boolean | null;
  cursor_reset: boolean | null;
  created_at: Date;
  committed_at: Date | null;
}

/**
 * PostgreSQL atomic semantic-mode transition store (CM-4b S3d).
 *
 * Lock order (every path):
 * 1. setTenantContext
 * 2. claim/read command receipt (insert pending or lock existing)
 * 3. lock ChannelConnection (FOR UPDATE)
 * 4. semantic CAS (when changed)
 * 5. baseline-reset ChannelPollCursor (when changed; connection already locked; version retained)
 * 6. insert audit (when changed)
 * 7. mark receipt committed
 *
 * Never locks cursor before connection.
 */
/** Optional Prisma interactive-transaction options (tests may raise timeout under remote latency). */
export type SemanticModeTransitionTransactionOptions = {
  maxWait?: number;
  timeout?: number;
};

export class PrismaChannelSemanticModeTransitionStore
  implements IChannelSemanticModeTransitionStore
{
  constructor(
    private readonly client: DbClient = prisma,
    private readonly hooks: SemanticModeTransitionTestHooks = {},
    /**
     * When unset, Prisma's default interactive-transaction timeout applies (5000 ms).
     * Production call sites must leave this unset; integration tests may raise it.
     */
    private readonly transactionOptions?: SemanticModeTransitionTransactionOptions,
  ) {}

  async executeTransition(
    command: SemanticModeTransitionCommand,
  ): Promise<SemanticModeTransitionResult> {
    validateCommand(command);
    const fingerprint = fingerprintSemanticModeTransitionCommand({
      tenantId: command.tenantId,
      operation: command.operation,
      commandId: command.commandId,
      connectionId: command.connectionId,
      actorId: command.actorId,
      expectedFromMode: command.expectedFromMode,
      expectedSemanticConfigVersion: command.expectedSemanticConfigVersion,
      targetSemanticMode: command.targetSemanticMode,
      reason: command.reason,
    });

    return withTenantTransaction(
      command.tenantId,
      (tx) => this.runInTransaction(tx, command, fingerprint),
      this.transactionOptions,
    );
  }

  private async runInTransaction(
    tx: PrismaTransactionClient,
    command: SemanticModeTransitionCommand,
    fingerprint: string,
  ): Promise<SemanticModeTransitionResult> {
    const claim = await this.claimOrLoadReceipt(tx, command, fingerprint);
    if (claim.kind === "replay") {
      return claim.result;
    }

    await this.hooks.afterReceiptAcquired?.();

    const connectionRepo = new PrismaChannelConnectionRepository(tx);
    const cursorRepo = new PrismaChannelPollCursorRepository(tx);

    await this.lockConnection(tx, command.tenantId, command.connectionId);

    const connection = await connectionRepo.findById(
      command.tenantId,
      command.connectionId,
    );
    if (!connection) {
      throw new NotFoundError("ChannelConnection", command.connectionId);
    }

    if (connection.semanticMode !== command.expectedFromMode) {
      throw new ConflictError(
        "ChannelConnection semantic mode does not match expectedFromMode",
      );
    }
    if (connection.semanticConfigVersion !== command.expectedSemanticConfigVersion) {
      throw new ConflictError("ChannelConnection semantic configuration version is stale");
    }

    assertFeedSemanticModeAllowed(
      command.targetSemanticMode,
      command.allowedFeedSemanticModes,
    );

    const now = command.now ?? new Date();
    const previousMode = connection.semanticMode;
    const previousVersion = connection.semanticConfigVersion;
    const sameMode = previousMode === command.targetSemanticMode;

    let newMode = previousMode;
    let newVersion = previousVersion;
    let changed = false;
    let cursorReset = false;

    if (!sameMode) {
      const resultingVersion = previousVersion + 1;
      await connectionRepo.persistSemanticState({
        tenantId: command.tenantId,
        connectionId: command.connectionId,
        expectedSemanticConfigVersion: previousVersion,
        semanticMode: command.targetSemanticMode,
        semanticConfigVersion: resultingVersion,
        updatedAt: now,
      });
      await this.hooks.afterSemanticPersist?.();

      await cursorRepo.resetPollCursorBaseline({
        tenantId: command.tenantId,
        connectionId: command.connectionId,
        semanticConfigVersion: resultingVersion,
        baselinePayload: EMPTY_ICAL_CURSOR_BASELINE_PAYLOAD,
      });
      await this.hooks.afterCursorReset?.();
      cursorReset = true;

      await tx.auditLog.create({
        data: {
          tenantId: command.tenantId,
          actorId: command.actorId,
          action: "channel.connection.semantic_mode_changed",
          resourceType: "ChannelConnection",
          resourceId: command.connectionId,
          metadata: {
            previousMode,
            newMode: command.targetSemanticMode,
            previousSemanticConfigVersion: previousVersion,
            newSemanticConfigVersion: resultingVersion,
            commandId: command.commandId,
            operation: command.operation,
            reason: command.reason ?? null,
            cursorReset: true,
          } as Prisma.InputJsonValue,
          ipAddress: command.ipAddress ?? null,
        },
      });
      await this.hooks.afterAudit?.();

      newMode = command.targetSemanticMode;
      newVersion = resultingVersion;
      changed = true;
    }

    await this.hooks.beforeReceiptCommit?.();

    await tx.channelSemanticTransitionCommand.update({
      where: {
        tenantId_operation_commandId: {
          tenantId: command.tenantId,
          operation: command.operation,
          commandId: command.commandId,
        },
      },
      data: {
        status: "committed",
        previousSemanticConfigVersion: previousVersion,
        resultingSemanticConfigVersion: newVersion,
        changed,
        cursorReset,
        committedAt: now,
      },
    });

    return {
      tenantId: command.tenantId,
      connectionId: command.connectionId,
      commandId: command.commandId,
      previousMode,
      newMode,
      previousSemanticConfigVersion: previousVersion,
      newSemanticConfigVersion: newVersion,
      changed,
      cursorReset,
      committedAt: now,
      replayed: false,
    };
  }

  private async claimOrLoadReceipt(
    tx: PrismaTransactionClient,
    command: SemanticModeTransitionCommand,
    fingerprint: string,
  ): Promise<
    | { kind: "owned" }
    | { kind: "replay"; result: SemanticModeTransitionResult }
  > {
    const inserted = await tx.$queryRaw<ReceiptRow[]>`
      INSERT INTO "channel_semantic_transition_commands" (
        "tenant_id",
        "operation",
        "command_id",
        "connection_id",
        "actor_id",
        "expected_from_mode",
        "target_mode",
        "expected_semantic_config_version",
        "request_fingerprint",
        "status",
        "created_at"
      ) VALUES (
        ${command.tenantId}::uuid,
        ${command.operation},
        ${command.commandId},
        ${command.connectionId},
        ${command.actorId}::uuid,
        ${command.expectedFromMode}::"ChannelFeedSemanticMode",
        ${command.targetSemanticMode}::"ChannelFeedSemanticMode",
        ${command.expectedSemanticConfigVersion},
        ${fingerprint},
        'pending'::"ChannelSemanticTransitionCommandStatus",
        ${command.now ?? new Date()}
      )
      ON CONFLICT ("tenant_id", "operation", "command_id") DO NOTHING
      RETURNING
        "tenant_id",
        "operation",
        "command_id",
        "connection_id",
        "actor_id",
        "expected_from_mode"::text AS expected_from_mode,
        "target_mode"::text AS target_mode,
        "expected_semantic_config_version",
        "request_fingerprint",
        "status"::text AS status,
        "previous_semantic_config_version",
        "resulting_semantic_config_version",
        "changed",
        "cursor_reset",
        "created_at",
        "committed_at"
    `;

    if (inserted.length === 1) {
      return { kind: "owned" };
    }

    const existingRows = await tx.$queryRaw<ReceiptRow[]>`
      SELECT
        "tenant_id",
        "operation",
        "command_id",
        "connection_id",
        "actor_id",
        "expected_from_mode"::text AS expected_from_mode,
        "target_mode"::text AS target_mode,
        "expected_semantic_config_version",
        "request_fingerprint",
        "status"::text AS status,
        "previous_semantic_config_version",
        "resulting_semantic_config_version",
        "changed",
        "cursor_reset",
        "created_at",
        "committed_at"
      FROM "channel_semantic_transition_commands"
      WHERE "tenant_id" = ${command.tenantId}::uuid
        AND "operation" = ${command.operation}
        AND "command_id" = ${command.commandId}
      FOR UPDATE
    `;

    const existing = existingRows[0];
    if (!existing) {
      throw new ConflictError(
        "Semantic transition command receipt disappeared during concurrent claim; retry",
      );
    }

    if (existing.request_fingerprint !== fingerprint) {
      throw new IdempotencyConflictError(
        "Semantic transition command fingerprint conflicts with an existing receipt",
      );
    }

    if (existing.status === "committed") {
      return {
        kind: "replay",
        result: hydrateCommittedReceipt(existing, true),
      };
    }

    throw new ConflictError(
      "Semantic transition command receipt is pending in another execution",
    );
  }

  private async lockConnection(
    tx: PrismaTransactionClient,
    tenantId: string,
    connectionId: string,
  ): Promise<void> {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id"
      FROM "channel_connections"
      WHERE "tenant_id" = ${tenantId}::uuid
        AND "id" = ${connectionId}
      FOR UPDATE
    `;
    if (!rows[0]) {
      throw new NotFoundError("ChannelConnection", connectionId);
    }
  }
}

function validateCommand(command: SemanticModeTransitionCommand): void {
  if (command.operation !== CHANNEL_SEMANTIC_MODE_TRANSITION_OPERATION) {
    throw new ValidationError(
      `Unsupported semantic transition operation: ${String(command.operation)}`,
    );
  }
  parseFeedSemanticMode(command.expectedFromMode);
  parseFeedSemanticMode(command.targetSemanticMode);
  parseSemanticConfigVersion(command.expectedSemanticConfigVersion);
  if (!Array.isArray(command.allowedFeedSemanticModes)) {
    throw new ValidationError("allowedFeedSemanticModes is required");
  }
}

function hydrateCommittedReceipt(
  row: ReceiptRow,
  replayed: boolean,
): SemanticModeTransitionResult {
  if (row.status !== "committed") {
    throw new PersistenceCorruptionError(
      "Semantic transition receipt is not committed",
    );
  }
  if (
    row.previous_semantic_config_version == null ||
    row.resulting_semantic_config_version == null ||
    typeof row.changed !== "boolean" ||
    typeof row.cursor_reset !== "boolean" ||
    row.committed_at == null
  ) {
    throw new PersistenceCorruptionError(
      "Committed semantic transition receipt is missing required result fields",
    );
  }

  return {
    tenantId: row.tenant_id,
    connectionId: row.connection_id,
    commandId: row.command_id,
    previousMode: parseFeedSemanticMode(row.expected_from_mode),
    newMode: parseFeedSemanticMode(row.target_mode),
    previousSemanticConfigVersion: parseSemanticConfigVersion(
      row.previous_semantic_config_version,
    ),
    newSemanticConfigVersion: parseSemanticConfigVersion(
      row.resulting_semantic_config_version,
    ),
    changed: row.changed,
    cursorReset: row.cursor_reset,
    committedAt: new Date(row.committed_at),
    replayed,
  };
}
