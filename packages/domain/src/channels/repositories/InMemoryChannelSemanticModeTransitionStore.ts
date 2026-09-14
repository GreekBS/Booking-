import {
  ConflictError,
  IdempotencyConflictError,
  NotFoundError,
  PersistenceCorruptionError,
  ValidationError,
} from "../../shared/errors/DomainError";
import type { AuditEntry } from "../../shared/types/index";
import type { IAuditLogRepository } from "../../shared/ports/InfrastructurePorts";
import { assertFeedSemanticModeAllowed } from "../types/FeedSemanticModePolicy";
import {
  isFeedSemanticMode,
  parseFeedSemanticMode,
  parseSemanticConfigVersion,
  type FeedSemanticMode,
} from "../types/FeedSemanticMode";
import type { ChannelConnectionProps } from "../domain/ChannelConnection";
import {
  CHANNEL_SEMANTIC_MODE_TRANSITION_OPERATION,
  fingerprintSemanticModeTransitionCommand,
} from "../application/semanticModeTransitionFingerprint";
import type { InMemoryChannelConnectionRepository } from "./InMemoryChannelConnectionRepository";
import type { InMemoryChannelPollCursorRepository } from "./InMemoryChannelPollCursorRepository";
import { EMPTY_ICAL_CURSOR_BASELINE_PAYLOAD } from "../providers/ical/map/icalEmptyCursorBaseline";
import type {
  IChannelSemanticModeTransitionStore,
  SemanticModeTransitionCommand,
  SemanticModeTransitionResult,
  SemanticModeTransitionTestHooks,
} from "../ports/IChannelSemanticModeTransitionStore";

interface CommittedReceiptRecord {
  tenantId: string;
  operation: string;
  commandId: string;
  connectionId: string;
  actorId: string;
  expectedFromMode: FeedSemanticMode;
  targetMode: FeedSemanticMode;
  expectedSemanticConfigVersion: number;
  requestFingerprint: string;
  status: "committed";
  previousSemanticConfigVersion: number;
  resultingSemanticConfigVersion: number;
  changed: boolean;
  cursorReset: boolean;
  committedAt: Date;
  createdAt: Date;
}

interface PendingReceiptRecord {
  tenantId: string;
  operation: string;
  commandId: string;
  connectionId: string;
  actorId: string;
  expectedFromMode: FeedSemanticMode;
  targetMode: FeedSemanticMode;
  expectedSemanticConfigVersion: number;
  requestFingerprint: string;
  status: "pending";
  createdAt: Date;
}

type ReceiptRecord = CommittedReceiptRecord | PendingReceiptRecord;

function receiptKey(tenantId: string, operation: string, commandId: string): string {
  return `${tenantId}:${operation}:${commandId}`;
}

export class InMemoryTransitionAuditLog implements IAuditLogRepository {
  readonly entries: AuditEntry[] = [];

  async append(entry: AuditEntry): Promise<void> {
    this.entries.push({
      ...entry,
      metadata: { ...entry.metadata },
    });
  }

  clear(): void {
    this.entries.length = 0;
  }
}

/**
 * Logical in-memory parity for the S3d atomic transition transaction.
 * Does not prove PostgreSQL locking; uses snapshot rollback for all-or-nothing.
 */
export class InMemoryChannelSemanticModeTransitionStore
  implements IChannelSemanticModeTransitionStore
{
  private readonly receipts = new Map<string, ReceiptRecord>();
  readonly auditLog: InMemoryTransitionAuditLog;
  private readonly hooks: SemanticModeTransitionTestHooks;

  constructor(
    private readonly connections: InMemoryChannelConnectionRepository,
    private readonly cursors: InMemoryChannelPollCursorRepository,
    auditLog: InMemoryTransitionAuditLog = new InMemoryTransitionAuditLog(),
    hooks?: SemanticModeTransitionTestHooks,
  ) {
    this.auditLog = auditLog;
    this.hooks = hooks ?? {};
  }

  clear(): void {
    this.receipts.clear();
    this.auditLog.clear();
  }

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

    const key = receiptKey(command.tenantId, command.operation, command.commandId);
    const existing = this.receipts.get(key);
    if (existing) {
      if (existing.requestFingerprint !== fingerprint) {
        throw new IdempotencyConflictError(
          "Semantic transition command fingerprint conflicts with an existing receipt",
        );
      }
      if (existing.status === "committed") {
        return hydrateCommittedResult(existing, true);
      }
      throw new ConflictError(
        "Semantic transition command receipt is pending in another execution",
      );
    }

    const snapshot = {
      receipts: cloneReceipts(this.receipts),
      audits: this.auditLog.entries.map((entry) => ({
        ...entry,
        metadata: { ...entry.metadata },
      })),
      connections: this.connections.exportStoreSnapshot(),
      cursors: this.cursors.exportStoreSnapshot(),
    };
    const now = command.now ?? new Date();

    try {
      const pending: PendingReceiptRecord = {
        tenantId: command.tenantId,
        operation: command.operation,
        commandId: command.commandId,
        connectionId: command.connectionId,
        actorId: command.actorId,
        expectedFromMode: command.expectedFromMode,
        targetMode: command.targetSemanticMode,
        expectedSemanticConfigVersion: command.expectedSemanticConfigVersion,
        requestFingerprint: fingerprint,
        status: "pending",
        createdAt: now,
      };
      this.receipts.set(key, pending);
      await this.hooks.afterReceiptAcquired?.();

      const connection = await this.connections.findById(
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

      const sameMode = connection.semanticMode === command.targetSemanticMode;
      const previousMode = connection.semanticMode;
      const previousVersion = connection.semanticConfigVersion;
      let newVersion = previousVersion;
      let changed = false;
      let cursorReset = false;

      if (!sameMode) {
        const resultingVersion = previousVersion + 1;
        await this.connections.persistSemanticState({
          tenantId: command.tenantId,
          connectionId: command.connectionId,
          expectedSemanticConfigVersion: previousVersion,
          semanticMode: command.targetSemanticMode,
          semanticConfigVersion: resultingVersion,
          updatedAt: now,
        });
        await this.hooks.afterSemanticPersist?.();

        await this.cursors.resetPollCursorBaseline({
          tenantId: command.tenantId,
          connectionId: command.connectionId,
          semanticConfigVersion: resultingVersion,
          baselinePayload: EMPTY_ICAL_CURSOR_BASELINE_PAYLOAD,
        });
        await this.hooks.afterCursorReset?.();
        cursorReset = true;

        await this.auditLog.append({
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
          },
          ipAddress: command.ipAddress ?? null,
        });
        await this.hooks.afterAudit?.();

        newVersion = resultingVersion;
        changed = true;
      }

      await this.hooks.beforeReceiptCommit?.();

      const committed: CommittedReceiptRecord = {
        ...pending,
        status: "committed",
        previousSemanticConfigVersion: previousVersion,
        resultingSemanticConfigVersion: newVersion,
        changed,
        cursorReset,
        committedAt: now,
      };
      this.receipts.set(key, committed);
      return hydrateCommittedResult(committed, false);
    } catch (error) {
      this.receipts.clear();
      for (const [k, v] of snapshot.receipts) {
        this.receipts.set(k, v);
      }
      this.auditLog.clear();
      for (const entry of snapshot.audits) {
        this.auditLog.entries.push(entry);
      }
      this.connections.restoreStoreSnapshot(
        snapshot.connections as Map<string, ChannelConnectionProps>,
      );
      this.cursors.restoreStoreSnapshot(snapshot.cursors);
      throw error;
    }
  }
}

function cloneReceipts(source: Map<string, ReceiptRecord>): Map<string, ReceiptRecord> {
  return new Map(
    [...source.entries()].map(([key, value]) => [
      key,
      value.status === "committed"
        ? {
            ...value,
            committedAt: new Date(value.committedAt),
            createdAt: new Date(value.createdAt),
          }
        : {
            ...value,
            createdAt: new Date(value.createdAt),
          },
    ]),
  );
}

function validateCommand(command: SemanticModeTransitionCommand): void {
  if (command.operation !== CHANNEL_SEMANTIC_MODE_TRANSITION_OPERATION) {
    throw new ValidationError(
      `Unsupported semantic transition operation: ${String(command.operation)}`,
    );
  }
  if (!isFeedSemanticMode(command.expectedFromMode)) {
    throw new ValidationError(`Invalid expectedFromMode: ${String(command.expectedFromMode)}`);
  }
  if (!isFeedSemanticMode(command.targetSemanticMode)) {
    throw new ValidationError(
      `Invalid targetSemanticMode: ${String(command.targetSemanticMode)}`,
    );
  }
  parseSemanticConfigVersion(command.expectedSemanticConfigVersion);
  if (!Array.isArray(command.allowedFeedSemanticModes)) {
    throw new ValidationError("allowedFeedSemanticModes is required");
  }
}

function hydrateCommittedResult(
  receipt: CommittedReceiptRecord,
  replayed: boolean,
): SemanticModeTransitionResult {
  if (
    receipt.previousSemanticConfigVersion == null ||
    receipt.resultingSemanticConfigVersion == null ||
    typeof receipt.changed !== "boolean" ||
    typeof receipt.cursorReset !== "boolean" ||
    receipt.committedAt == null
  ) {
    throw new PersistenceCorruptionError(
      "Committed semantic transition receipt is missing required result fields",
    );
  }
  return {
    tenantId: receipt.tenantId,
    connectionId: receipt.connectionId,
    commandId: receipt.commandId,
    previousMode: parseFeedSemanticMode(receipt.expectedFromMode),
    newMode: parseFeedSemanticMode(receipt.targetMode),
    previousSemanticConfigVersion: parseSemanticConfigVersion(
      receipt.previousSemanticConfigVersion,
    ),
    newSemanticConfigVersion: parseSemanticConfigVersion(
      receipt.resultingSemanticConfigVersion,
    ),
    changed: receipt.changed,
    cursorReset: receipt.cursorReset,
    committedAt: new Date(receipt.committedAt),
    replayed,
  };
}
