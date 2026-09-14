import { Result } from "../../shared/kernel/Result";
import {
  ConflictError,
  ForbiddenError,
  IdempotencyConflictError,
  NotFoundError,
  ValidationError,
} from "../../shared/errors/DomainError";
import type { UseCaseAuditContext } from "../../shared/types/AuditContext";
import type { ActorContext, PermissionChecker } from "../../shared/services/PermissionChecker";
import { PERMISSIONS } from "@hcp/permissions";
import type { ChannelConnectionStatus } from "../domain/ChannelConnectionStatus";
import type { IChannelConnectionRepository } from "../ports/IChannelConnectionRepository";
import type { IChannelCredentialStore } from "../ports/IChannelCredentialStore";
import type {
  IcalCredentialRotationCommandRecord,
  IIcalCredentialRotationStore,
} from "../ports/IIcalCredentialRotationStore";
import { assertIcalCredentialMaterialShape } from "./channelCredentialMaterial";
import {
  CHANNEL_ICAL_CREDENTIAL_ROTATION_OPERATION,
  fingerprintIcalCredentialRotationCommand,
} from "./icalCredentialRotationFingerprint";

export interface RotateIcalConnectionCredentialsCommand {
  tenantId: string;
  connectionId: string;
  /** Durable idempotency key for the rotation receipt. */
  commandId: string;
  /** Opaque credential material; must include `feedUrl`. Never logged or audited. */
  material: Record<string, string>;
  expectedSemanticConfigVersion?: number | null;
  reason?: string | null;
  now?: Date;
}

export interface RotateIcalConnectionCredentialsResult {
  readonly connectionId: string;
  readonly commandId: string;
  readonly operation: typeof CHANNEL_ICAL_CREDENTIAL_ROTATION_OPERATION;
  readonly status: "committed";
  /** True when a committed receipt was replayed instead of committing a new epoch. */
  readonly replayed: boolean;
  /** Rotation never auto-resumes; the connection stays paused. */
  readonly lifecycleStatus: Extract<ChannelConnectionStatus, "paused">;
  readonly pausedByRotation: boolean;
  readonly previousSemanticConfigVersion: number;
  readonly resultingSemanticConfigVersion: number;
  readonly cursorBaselineReset: boolean;
  readonly retainedCursorVersion: number | null;
  readonly supersededPendingCount: number;
  /** Best-effort cleanup of the superseded sealed secret. */
  readonly previousCredentialDeleted: boolean;
  readonly requiresOperatorResume: true;
  readonly requiresPollRematerialization: true;
}

export type RotationLogFn = (fields: Record<string, unknown>) => void;

const ROTATABLE_STATUSES: ReadonlySet<ChannelConnectionStatus> = new Set([
  "active",
  "paused",
]);

/**
 * P1-S6c iCal credential rotation (phases 0–5).
 *
 * Phase 0 — precheck: authorization, provider, material shape, committed-receipt
 *           replay, then optional epoch CAS and in-flight rotation gate.
 * Phase 1 — pause the connection and claim a durable `in_progress` receipt.
 *           No vault I/O runs inside that transaction.
 * Phase 2 — seal the new credential OUTSIDE any transaction, then record the
 *           opaque reference on the receipt. Secrets never reach logs or audit.
 * Phase 3 — commit the epoch: replace credentialRef, bump the semantic epoch,
 *           baseline-reset the poll cursor (version retained), supersede pending
 *           reconciliations, mark the receipt committed, and audit.
 * Phase 4 — best-effort delete of the superseded sealed secret. Failures are
 *           logged with safe codes only and never fail the rotation.
 * Phase 5 — DO NOT auto-resume. An operator must resume explicitly.
 *
 * Retrying the same `commandId` after phase 2 reuses the stored
 * `newCredentialRef` and never commits a second epoch.
 */
export class RotateIcalConnectionCredentialsUseCase {
  constructor(
    private readonly connectionRepository: IChannelConnectionRepository,
    private readonly rotationStore: IIcalCredentialRotationStore,
    private readonly credentialStore: IChannelCredentialStore,
    private readonly permissionChecker: PermissionChecker,
    private readonly log: RotationLogFn = () => {},
  ) {}

  async execute(
    command: RotateIcalConnectionCredentialsCommand,
    actor: ActorContext,
    audit: UseCaseAuditContext,
  ): Promise<Result<RotateIcalConnectionCredentialsResult, Error>> {
    try {
      // ---- Phase 0: precheck -------------------------------------------------
      const tenantId = requireId(command.tenantId, "tenantId");
      const connectionId = requireId(command.connectionId, "connectionId");
      const commandId = requireId(command.commandId, "commandId");

      if (
        !this.permissionChecker.hasPermission(
          actor,
          PERMISSIONS.CHANNELS_CONNECTION_MANAGE,
          tenantId,
        )
      ) {
        return Result.fail(new ForbiddenError());
      }

      assertIcalCredentialMaterialShape(command.material);

      const expectedSemanticConfigVersion = normalizeExpectedVersion(
        command.expectedSemanticConfigVersion,
      );
      const reason = normalizeReason(command.reason);

      const connection = await this.connectionRepository.findById(tenantId, connectionId);
      if (!connection) {
        return Result.fail(new NotFoundError("ChannelConnection", connectionId));
      }
      if (connection.provider !== "ical") {
        return Result.fail(
          new ConflictError(
            "Credential rotation is only supported for iCal connections",
            "provider_mismatch",
          ),
        );
      }

      const requestFingerprint = fingerprintIcalCredentialRotationCommand({
        tenantId,
        operation: CHANNEL_ICAL_CREDENTIAL_ROTATION_OPERATION,
        commandId,
        connectionId,
        actorId: audit.actorId,
        expectedSemanticConfigVersion,
        material: command.material,
        reason,
      });

      // The durable receipt outranks every live precondition: a committed
      // rotation already advanced the epoch, so an operator retry must replay
      // rather than fail the (now stale) epoch CAS.
      const existing = await this.rotationStore.findCommand(tenantId, commandId);
      if (existing && existing.status === "committed") {
        if (existing.requestFingerprint !== requestFingerprint) {
          return Result.fail(
            new IdempotencyConflictError(
              "Credential rotation command fingerprint conflicts with an existing receipt",
            ),
          );
        }
        if (existing.connectionId !== connectionId) {
          return Result.fail(
            new IdempotencyConflictError(
              "Credential rotation command belongs to a different connection",
            ),
          );
        }
        return Result.ok(replayResult(existing, false));
      }

      if (!ROTATABLE_STATUSES.has(connection.status)) {
        return Result.fail(
          new ConflictError(
            `Cannot rotate credentials for connection in status: ${connection.status}`,
            "lifecycle_status_conflict",
          ),
        );
      }
      if (
        expectedSemanticConfigVersion != null &&
        connection.semanticConfigVersion !== expectedSemanticConfigVersion
      ) {
        return Result.fail(
          new ConflictError("ChannelConnection semantic configuration version is stale"),
        );
      }

      const inFlight = await this.rotationStore.findInProgressForConnection(
        tenantId,
        connectionId,
      );
      if (inFlight && inFlight.commandId !== commandId) {
        return Result.fail(
          new ConflictError(
            "Another credential rotation is already in progress for this connection",
            "rotation_in_progress",
          ),
        );
      }

      // ---- Phase 1: pause + durable claim (no vault I/O in TX) -------------
      // Retry after vault-write/crash: reuse the existing in_progress receipt
      // without re-entering phase 1 (connection is already paused; epoch unchanged).
      let claim: {
        command: IcalCredentialRotationCommandRecord;
        pausedNow: boolean;
      };
      if (
        inFlight &&
        inFlight.commandId === commandId &&
        inFlight.newCredentialRef != null
      ) {
        if (inFlight.requestFingerprint !== requestFingerprint) {
          return Result.fail(
            new IdempotencyConflictError(
              "Credential rotation command fingerprint conflicts with an existing receipt",
            ),
          );
        }
        claim = { command: inFlight, pausedNow: false };
      } else {
        const phase1 = await this.rotationStore.phase1PauseAndClaimCommand({
          tenantId,
          connectionId,
          commandId,
          actorId: audit.actorId,
          requestFingerprint,
          expectedSemanticConfigVersion,
          reason,
          ipAddress: audit.ipAddress,
          now: command.now,
        });

        if (phase1.command.status === "committed") {
          return Result.ok(replayResult(phase1.command, false));
        }
        claim = {
          command: phase1.command,
          pausedNow: phase1.pausedNow,
        };
      }

      if (claim.command.status === "committed") {
        return Result.ok(replayResult(claim.command, false));
      }

      // ---- Phase 2: vault write outside any transaction --------------------
      let newCredentialRef = claim.command.newCredentialRef;
      if (newCredentialRef == null) {
        try {
          const reference = await this.credentialStore.putCredential(
            tenantId,
            command.material,
          );
          newCredentialRef = reference.value;
        } catch (error) {
          await this.safeMarkFailed(tenantId, connectionId, commandId, "vault_write_failed");
          this.log({
            action: "channels.ical_credential_rotation_failed",
            reasonCode: "vault_write_failed",
            tenantId,
            connectionId,
            commandId,
          });
          return Result.fail(
            error instanceof Error
              ? new ConflictError(
                  "Sealing the new iCal credential failed; rotation aborted with the connection paused",
                  "vault_write_failed",
                )
              : new Error("vault_write_failed"),
          );
        }

        await this.rotationStore.markVaultWritten({
          tenantId,
          connectionId,
          commandId,
          newCredentialRef,
          now: command.now,
        });
      }

      // ---- Phase 3: epoch commit -------------------------------------------
      const committed = await this.rotationStore.phase3CommitEpoch({
        tenantId,
        connectionId,
        commandId,
        actorId: audit.actorId,
        newCredentialRef,
        reason,
        ipAddress: audit.ipAddress,
        now: command.now,
      });

      // ---- Phase 4: best-effort cleanup of the superseded secret ------------
      let previousCredentialDeleted = false;
      const previousCredentialRef = committed.previousCredentialRef;
      if (
        !committed.replayed &&
        previousCredentialRef != null &&
        previousCredentialRef !== newCredentialRef
      ) {
        try {
          await this.credentialStore.deleteSecret(
            tenantId,
            previousCredentialRef,
            "credential",
          );
          previousCredentialDeleted = true;
        } catch {
          // Rotation is already durable; cleanup is best-effort and must not
          // surface provider detail or the sealed reference.
          this.log({
            action: "channels.ical_credential_rotation_cleanup_failed",
            reasonCode: "vault_cleanup_failed",
            tenantId,
            connectionId,
            commandId,
          });
        }
      }

      // ---- Phase 5: no auto-resume ------------------------------------------
      return Result.ok({
        connectionId,
        commandId,
        operation: CHANNEL_ICAL_CREDENTIAL_ROTATION_OPERATION,
        status: "committed",
        replayed: committed.replayed,
        lifecycleStatus: "paused",
        pausedByRotation: claim.pausedNow,
        previousSemanticConfigVersion: committed.previousSemanticConfigVersion,
        resultingSemanticConfigVersion: committed.resultingSemanticConfigVersion,
        cursorBaselineReset: committed.cursorBaselineReset,
        retainedCursorVersion: committed.retainedCursorVersion,
        supersededPendingCount: committed.supersededPendingCount,
        previousCredentialDeleted,
        requiresOperatorResume: true,
        requiresPollRematerialization: true,
      });
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }

  private async safeMarkFailed(
    tenantId: string,
    connectionId: string,
    commandId: string,
    reasonCode: "vault_write_failed",
  ): Promise<void> {
    try {
      await this.rotationStore.markFailed({
        tenantId,
        connectionId,
        commandId,
        reasonCode,
      });
    } catch {
      // Receipt bookkeeping is advisory here; the rotation already failed.
    }
  }
}

function replayResult(
  record: IcalCredentialRotationCommandRecord,
  pausedNow: boolean,
): RotateIcalConnectionCredentialsResult {
  return {
    connectionId: record.connectionId,
    commandId: record.commandId,
    operation: CHANNEL_ICAL_CREDENTIAL_ROTATION_OPERATION,
    status: "committed",
    replayed: true,
    lifecycleStatus: "paused",
    pausedByRotation: pausedNow,
    previousSemanticConfigVersion: record.previousSemanticConfigVersion ?? 0,
    resultingSemanticConfigVersion: record.resultingSemanticConfigVersion ?? 0,
    cursorBaselineReset: record.cursorBaselineReset ?? false,
    retainedCursorVersion: null,
    supersededPendingCount: record.supersededPendingCount ?? 0,
    previousCredentialDeleted: false,
    requiresOperatorResume: true,
    requiresPollRematerialization: true,
  };
}

function requireId(value: string, label: string): string {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (trimmed.length === 0) {
    throw new ValidationError(`${label} is required`);
  }
  if (trimmed.length > 255) {
    throw new ValidationError(`${label} must be at most 255 characters`);
  }
  return trimmed;
}

function normalizeExpectedVersion(
  value: number | null | undefined,
): number | null {
  if (value == null) {
    return null;
  }
  if (!Number.isInteger(value) || value < 1) {
    throw new ValidationError(
      "expectedSemanticConfigVersion must be a positive integer when provided",
    );
  }
  return value;
}

function normalizeReason(reason: string | null | undefined): string | null {
  if (reason == null) {
    return null;
  }
  const trimmed = reason.trim();
  if (trimmed.length === 0) {
    return null;
  }
  if (trimmed.length > 500) {
    throw new ValidationError("reason must be at most 500 characters");
  }
  return trimmed;
}
