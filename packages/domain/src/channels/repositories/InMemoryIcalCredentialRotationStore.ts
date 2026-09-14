import {
  ConflictError,
  IdempotencyConflictError,
  NotFoundError,
  ValidationError,
} from "../../shared/errors/DomainError";
import { CHANNEL_ICAL_CREDENTIAL_ROTATION_OPERATION } from "../application/icalCredentialRotationFingerprint";
import { CredentialReference } from "../domain/value-objects/CredentialReference";
import type { ChannelConnectionProps } from "../domain/ChannelConnection";
import { EMPTY_ICAL_CURSOR_BASELINE_PAYLOAD } from "../providers/ical/map/icalEmptyCursorBaseline";
import type { IPendingChannelReconciliationSuperseder } from "../ports/IPendingChannelReconciliationSuperseder";
import type {
  IcalCredentialRotationCommandRecord,
  IcalCredentialRotationMarkFailedParams,
  IcalCredentialRotationMarkVaultWrittenParams,
  IcalCredentialRotationPhase1Params,
  IcalCredentialRotationPhase1Result,
  IcalCredentialRotationPhase3Params,
  IcalCredentialRotationPhase3Result,
  IcalCredentialRotationTestHooks,
  IIcalCredentialRotationStore,
} from "../ports/IIcalCredentialRotationStore";
import type { InMemoryChannelConnectionRepository } from "./InMemoryChannelConnectionRepository";
import type { InMemoryChannelPollCursorRepository } from "./InMemoryChannelPollCursorRepository";
import { InMemoryTransitionAuditLog } from "./InMemoryChannelSemanticModeTransitionStore";

type MutableRecord = {
  -readonly [K in keyof IcalCredentialRotationCommandRecord]: IcalCredentialRotationCommandRecord[K];
};

function receiptKey(tenantId: string, commandId: string): string {
  return `${tenantId}:${CHANNEL_ICAL_CREDENTIAL_ROTATION_OPERATION}:${commandId}`;
}

function clone(record: MutableRecord): IcalCredentialRotationCommandRecord {
  return {
    ...record,
    createdAt: new Date(record.createdAt),
    vaultWrittenAt: record.vaultWrittenAt ? new Date(record.vaultWrittenAt) : null,
    committedAt: record.committedAt ? new Date(record.committedAt) : null,
    failedAt: record.failedAt ? new Date(record.failedAt) : null,
  };
}

/**
 * Logical in-memory parity for the P1-S6c rotation phases.
 * Does not prove PostgreSQL locking; uses snapshot rollback for atomicity.
 */
export class InMemoryIcalCredentialRotationStore implements IIcalCredentialRotationStore {
  private readonly receipts = new Map<string, MutableRecord>();
  readonly auditLog: InMemoryTransitionAuditLog;
  private readonly hooks: IcalCredentialRotationTestHooks;

  constructor(
    private readonly connections: InMemoryChannelConnectionRepository,
    private readonly cursors: InMemoryChannelPollCursorRepository,
    private readonly superseder: IPendingChannelReconciliationSuperseder | null = null,
    auditLog: InMemoryTransitionAuditLog = new InMemoryTransitionAuditLog(),
    hooks?: IcalCredentialRotationTestHooks,
  ) {
    this.auditLog = auditLog;
    this.hooks = hooks ?? {};
  }

  clear(): void {
    this.receipts.clear();
    this.auditLog.clear();
  }

  async phase1PauseAndClaimCommand(
    params: IcalCredentialRotationPhase1Params,
  ): Promise<IcalCredentialRotationPhase1Result> {
    assertFingerprint(params.requestFingerprint);
    const now = params.now ?? new Date();
    const key = receiptKey(params.tenantId, params.commandId);
    const existing = this.receipts.get(key);

    if (existing) {
      if (existing.requestFingerprint !== params.requestFingerprint) {
        throw new IdempotencyConflictError(
          "Credential rotation command fingerprint conflicts with an existing receipt",
        );
      }
      if (existing.connectionId !== params.connectionId) {
        throw new IdempotencyConflictError(
          "Credential rotation command belongs to a different connection",
        );
      }
      if (existing.status === "failed" || existing.status === "abandoned") {
        throw new ConflictError(
          `Credential rotation command is terminal: ${existing.status}`,
          "rotation_command_terminal",
        );
      }
    }

    const connection = await this.loadRotatableConnection(
      params.tenantId,
      params.connectionId,
    );

    if (
      params.expectedSemanticConfigVersion != null &&
      connection.semanticConfigVersion !== params.expectedSemanticConfigVersion
    ) {
      throw new ConflictError(
        "ChannelConnection semantic configuration version is stale",
      );
    }

    if (!existing) {
      const other = await this.findInProgressForConnection(
        params.tenantId,
        params.connectionId,
      );
      if (other && other.commandId !== params.commandId) {
        throw new ConflictError(
          "Another credential rotation is already in progress for this connection",
          "rotation_in_progress",
        );
      }
    }

    const priorStatus = connection.status;
    let pausedNow = false;
    if (priorStatus === "active") {
      connection.pause(now);
      await this.connections.pauseWithExpectedSemanticVersion(
        connection,
        connection.semanticConfigVersion,
        priorStatus,
      );
      pausedNow = true;
    }

    if (existing) {
      await this.hooks.afterPhase1Claim?.();
      return {
        command: clone(existing),
        claimed: false,
        pausedNow,
        priorStatus,
        semanticConfigVersion: connection.semanticConfigVersion,
        previousCredentialRef: existing.previousCredentialRef,
      };
    }

    const record: MutableRecord = {
      tenantId: params.tenantId,
      operation: CHANNEL_ICAL_CREDENTIAL_ROTATION_OPERATION,
      commandId: params.commandId,
      connectionId: params.connectionId,
      actorId: params.actorId,
      expectedSemanticConfigVersion: params.expectedSemanticConfigVersion ?? null,
      requestFingerprint: params.requestFingerprint,
      status: "in_progress",
      previousCredentialRef: connection.credentialRef?.value ?? null,
      newCredentialRef: null,
      previousSemanticConfigVersion: null,
      resultingSemanticConfigVersion: null,
      supersededPendingCount: null,
      cursorBaselineReset: null,
      createdAt: now,
      vaultWrittenAt: null,
      committedAt: null,
      failedAt: null,
      failureReasonCode: null,
    };
    this.receipts.set(key, record);
    await this.hooks.afterPhase1Claim?.();

    return {
      command: clone(record),
      claimed: true,
      pausedNow,
      priorStatus,
      semanticConfigVersion: connection.semanticConfigVersion,
      previousCredentialRef: record.previousCredentialRef,
    };
  }

  async markVaultWritten(
    params: IcalCredentialRotationMarkVaultWrittenParams,
  ): Promise<IcalCredentialRotationCommandRecord> {
    const record = this.requireInProgress(params.tenantId, params.commandId);
    if (record.connectionId !== params.connectionId) {
      throw new ConflictError("Credential rotation receipt connection mismatch");
    }
    if (
      record.newCredentialRef != null &&
      record.newCredentialRef !== params.newCredentialRef
    ) {
      throw new ConflictError(
        "Credential rotation receipt already references a different sealed credential",
      );
    }
    record.newCredentialRef = params.newCredentialRef;
    record.vaultWrittenAt = params.now ?? new Date();
    return clone(record);
  }

  async phase3CommitEpoch(
    params: IcalCredentialRotationPhase3Params,
  ): Promise<IcalCredentialRotationPhase3Result> {
    const key = receiptKey(params.tenantId, params.commandId);
    const record = this.receipts.get(key);
    if (!record) {
      throw new NotFoundError("ChannelIcalCredentialRotationCommand", params.commandId);
    }
    if (record.status === "committed") {
      return hydrateCommittedResult(record, true);
    }
    if (record.status !== "in_progress") {
      throw new ConflictError(
        `Credential rotation command is terminal: ${record.status}`,
        "rotation_command_terminal",
      );
    }
    if (record.connectionId !== params.connectionId) {
      throw new ConflictError("Credential rotation receipt connection mismatch");
    }
    if (record.newCredentialRef !== params.newCredentialRef) {
      throw new ConflictError(
        "Credential rotation receipt does not reference the supplied sealed credential",
      );
    }

    const snapshot = {
      receipts: new Map([...this.receipts].map(([k, v]) => [k, { ...v }])),
      audits: this.auditLog.entries.map((entry) => ({
        ...entry,
        metadata: { ...entry.metadata },
      })),
      connections: this.connections.exportStoreSnapshot(),
      cursors: this.cursors.exportStoreSnapshot(),
    };

    try {
      const now = params.now ?? new Date();
      const connection = await this.loadRotatableConnection(
        params.tenantId,
        params.connectionId,
      );
      if (connection.status !== "paused") {
        throw new ConflictError(
          `Credential rotation commit requires a paused connection, found: ${connection.status}`,
          "lifecycle_status_conflict",
        );
      }
      if (
        record.expectedSemanticConfigVersion != null &&
        connection.semanticConfigVersion !== record.expectedSemanticConfigVersion
      ) {
        throw new ConflictError(
          "ChannelConnection semantic configuration version is stale",
        );
      }

      const previousVersion = connection.semanticConfigVersion;
      const resultingVersion = previousVersion + 1;

      connection.replaceCredentialReference(
        CredentialReference.create(params.newCredentialRef),
      );
      await this.connections.saveNonSemanticChanges(connection);
      await this.hooks.afterCredentialReplace?.();

      await this.connections.persistSemanticState({
        tenantId: params.tenantId,
        connectionId: params.connectionId,
        expectedSemanticConfigVersion: previousVersion,
        semanticMode: connection.semanticMode,
        semanticConfigVersion: resultingVersion,
        updatedAt: now,
      });
      await this.hooks.afterEpochBump?.();

      const baseline = await this.cursors.resetPollCursorBaseline({
        tenantId: params.tenantId,
        connectionId: params.connectionId,
        semanticConfigVersion: resultingVersion,
        baselinePayload: EMPTY_ICAL_CURSOR_BASELINE_PAYLOAD,
      });
      await this.hooks.afterCursorBaselineReset?.();

      const supersededPendingCount = this.superseder
        ? await this.superseder.supersedePendingForConnection(
            params.tenantId,
            params.connectionId,
          )
        : 0;
      await this.hooks.afterSupersede?.();

      await this.auditLog.append({
        tenantId: params.tenantId,
        actorId: params.actorId,
        action: "channel.connection.ical_credentials_rotated",
        resourceType: "ChannelConnection",
        resourceId: params.connectionId,
        metadata: {
          commandId: params.commandId,
          operation: record.operation,
          previousSemanticConfigVersion: previousVersion,
          resultingSemanticConfigVersion: resultingVersion,
          cursorBaselineReset: baseline.cursorRowUpdated,
          retainedCursorVersion: baseline.retainedVersion,
          supersededPendingCount,
          credentialRefRotated: true,
          reason: params.reason ?? null,
        },
        ipAddress: params.ipAddress ?? null,
      });

      await this.hooks.beforeReceiptCommit?.();

      record.status = "committed";
      record.previousSemanticConfigVersion = previousVersion;
      record.resultingSemanticConfigVersion = resultingVersion;
      record.supersededPendingCount = supersededPendingCount;
      record.cursorBaselineReset = baseline.cursorRowUpdated;
      record.committedAt = now;

      return {
        command: clone(record),
        replayed: false,
        previousSemanticConfigVersion: previousVersion,
        resultingSemanticConfigVersion: resultingVersion,
        supersededPendingCount,
        cursorBaselineReset: baseline.cursorRowUpdated,
        retainedCursorVersion: baseline.retainedVersion,
        previousCredentialRef: record.previousCredentialRef,
        committedAt: now,
      };
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

  async markFailed(
    params: IcalCredentialRotationMarkFailedParams,
  ): Promise<IcalCredentialRotationCommandRecord> {
    const record = this.requireInProgress(params.tenantId, params.commandId);
    if (record.connectionId !== params.connectionId) {
      throw new ConflictError("Credential rotation receipt connection mismatch");
    }
    record.status = params.reasonCode === "operator_abandoned" ? "abandoned" : "failed";
    record.failedAt = params.now ?? new Date();
    record.failureReasonCode = params.reasonCode;
    return clone(record);
  }

  async findCommand(
    tenantId: string,
    commandId: string,
  ): Promise<IcalCredentialRotationCommandRecord | null> {
    const record = this.receipts.get(receiptKey(tenantId, commandId));
    return record ? clone(record) : null;
  }

  async findInProgressForConnection(
    tenantId: string,
    connectionId: string,
  ): Promise<IcalCredentialRotationCommandRecord | null> {
    for (const record of this.receipts.values()) {
      if (
        record.tenantId === tenantId &&
        record.connectionId === connectionId &&
        record.status === "in_progress"
      ) {
        return clone(record);
      }
    }
    return null;
  }

  private requireInProgress(tenantId: string, commandId: string): MutableRecord {
    const record = this.receipts.get(receiptKey(tenantId, commandId));
    if (!record) {
      throw new NotFoundError("ChannelIcalCredentialRotationCommand", commandId);
    }
    if (record.status !== "in_progress") {
      throw new ConflictError(
        `Credential rotation command is not in progress: ${record.status}`,
        "rotation_command_terminal",
      );
    }
    return record;
  }

  private async loadRotatableConnection(tenantId: string, connectionId: string) {
    const connection = await this.connections.findById(tenantId, connectionId);
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
}

function assertFingerprint(fingerprint: string): void {
  if (typeof fingerprint !== "string" || !/^[0-9a-f]{64}$/.test(fingerprint)) {
    throw new ValidationError("requestFingerprint must be a 64-character hex digest");
  }
}

function hydrateCommittedResult(
  record: MutableRecord,
  replayed: boolean,
): IcalCredentialRotationPhase3Result {
  if (
    record.previousSemanticConfigVersion == null ||
    record.resultingSemanticConfigVersion == null ||
    record.committedAt == null
  ) {
    throw new ConflictError(
      "Committed credential rotation receipt is missing required result fields",
    );
  }
  return {
    command: clone(record),
    replayed,
    previousSemanticConfigVersion: record.previousSemanticConfigVersion,
    resultingSemanticConfigVersion: record.resultingSemanticConfigVersion,
    supersededPendingCount: record.supersededPendingCount ?? 0,
    cursorBaselineReset: record.cursorBaselineReset ?? false,
    retainedCursorVersion: null,
    previousCredentialRef: record.previousCredentialRef,
    committedAt: new Date(record.committedAt),
  };
}
