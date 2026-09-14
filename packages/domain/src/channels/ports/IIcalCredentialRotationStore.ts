import type { ChannelConnectionStatus } from "../domain/ChannelConnectionStatus";
import type { ChannelIcalCredentialRotationOperation } from "../application/icalCredentialRotationFingerprint";

export const ICAL_CREDENTIAL_ROTATION_STATUSES = [
  "in_progress",
  "committed",
  "failed",
  "abandoned",
] as const;

export type IcalCredentialRotationStatus =
  (typeof ICAL_CREDENTIAL_ROTATION_STATUSES)[number];

export function isIcalCredentialRotationStatus(
  value: unknown,
): value is IcalCredentialRotationStatus {
  return (
    typeof value === "string" &&
    (ICAL_CREDENTIAL_ROTATION_STATUSES as readonly string[]).includes(value)
  );
}

/**
 * Closed set of safe failure codes persisted on a rotation receipt.
 * Never carries provider messages, feed URLs, or credential material.
 */
export const ICAL_CREDENTIAL_ROTATION_FAILURE_REASON_CODES = [
  "vault_write_failed",
  "vault_cleanup_failed",
  "commit_conflict",
  "connection_not_found",
  "connection_not_rotatable",
  "precondition_failed",
  "operator_abandoned",
  "internal_error",
] as const;

export type IcalCredentialRotationFailureReasonCode =
  (typeof ICAL_CREDENTIAL_ROTATION_FAILURE_REASON_CODES)[number];

export function isIcalCredentialRotationFailureReasonCode(
  value: unknown,
): value is IcalCredentialRotationFailureReasonCode {
  return (
    typeof value === "string" &&
    (ICAL_CREDENTIAL_ROTATION_FAILURE_REASON_CODES as readonly string[]).includes(value)
  );
}

/** Durable receipt row. Contains opaque references and digests only. */
export interface IcalCredentialRotationCommandRecord {
  readonly tenantId: string;
  readonly operation: ChannelIcalCredentialRotationOperation;
  readonly commandId: string;
  readonly connectionId: string;
  readonly actorId: string;
  readonly expectedSemanticConfigVersion: number | null;
  readonly requestFingerprint: string;
  readonly status: IcalCredentialRotationStatus;
  readonly previousCredentialRef: string | null;
  readonly newCredentialRef: string | null;
  readonly previousSemanticConfigVersion: number | null;
  readonly resultingSemanticConfigVersion: number | null;
  readonly supersededPendingCount: number | null;
  readonly cursorBaselineReset: boolean | null;
  readonly createdAt: Date;
  readonly vaultWrittenAt: Date | null;
  readonly committedAt: Date | null;
  readonly failedAt: Date | null;
  readonly failureReasonCode: IcalCredentialRotationFailureReasonCode | null;
}

/** Phase 1 — pause + durable claim. Contains no vault I/O. */
export interface IcalCredentialRotationPhase1Params {
  readonly tenantId: string;
  readonly connectionId: string;
  readonly commandId: string;
  readonly actorId: string;
  readonly requestFingerprint: string;
  readonly expectedSemanticConfigVersion?: number | null;
  readonly reason?: string | null;
  readonly ipAddress?: string | null;
  readonly now?: Date;
}

export interface IcalCredentialRotationPhase1Result {
  readonly command: IcalCredentialRotationCommandRecord;
  /** false when an existing receipt for the same commandId was resumed. */
  readonly claimed: boolean;
  /** true when this execution transitioned active → paused. */
  readonly pausedNow: boolean;
  readonly priorStatus: ChannelConnectionStatus;
  readonly semanticConfigVersion: number;
  readonly previousCredentialRef: string | null;
}

export interface IcalCredentialRotationMarkVaultWrittenParams {
  readonly tenantId: string;
  readonly connectionId: string;
  readonly commandId: string;
  /** Opaque reference produced by the credential store. Never material. */
  readonly newCredentialRef: string;
  readonly now?: Date;
}

/** Phase 3 — epoch commit. */
export interface IcalCredentialRotationPhase3Params {
  readonly tenantId: string;
  readonly connectionId: string;
  readonly commandId: string;
  readonly actorId: string;
  readonly newCredentialRef: string;
  readonly reason?: string | null;
  readonly ipAddress?: string | null;
  readonly now?: Date;
}

export interface IcalCredentialRotationPhase3Result {
  readonly command: IcalCredentialRotationCommandRecord;
  /** true when an already-committed receipt was replayed (no second epoch). */
  readonly replayed: boolean;
  readonly previousSemanticConfigVersion: number;
  readonly resultingSemanticConfigVersion: number;
  readonly supersededPendingCount: number;
  readonly cursorBaselineReset: boolean;
  readonly retainedCursorVersion: number | null;
  readonly previousCredentialRef: string | null;
  readonly committedAt: Date;
}

export interface IcalCredentialRotationMarkFailedParams {
  readonly tenantId: string;
  readonly connectionId: string;
  readonly commandId: string;
  readonly reasonCode: IcalCredentialRotationFailureReasonCode;
  readonly now?: Date;
}

/**
 * P1-S6c durable credential rotation store.
 *
 * Phase boundaries exist so vault I/O never runs while PostgreSQL row locks are
 * held. Each store method owns one short transaction:
 *
 * - `phase1PauseAndClaimCommand` — lock connection, pause when active, insert or
 *   resume the `in_progress` receipt.
 * - `markVaultWritten` — record the new opaque reference after the vault write.
 * - `phase3CommitEpoch` — lock connection → mappings → pending reconciliations,
 *   validate paused + in_progress, replace credentialRef, bump the semantic
 *   epoch by one, baseline-reset the poll cursor (version retained), supersede
 *   pending reconciliations, mark the receipt committed, and audit.
 *
 * Lock order matches S6b: connection → mappings → reconciliation → blocks.
 */
export interface IIcalCredentialRotationStore {
  phase1PauseAndClaimCommand(
    params: IcalCredentialRotationPhase1Params,
  ): Promise<IcalCredentialRotationPhase1Result>;

  markVaultWritten(
    params: IcalCredentialRotationMarkVaultWrittenParams,
  ): Promise<IcalCredentialRotationCommandRecord>;

  phase3CommitEpoch(
    params: IcalCredentialRotationPhase3Params,
  ): Promise<IcalCredentialRotationPhase3Result>;

  markFailed(
    params: IcalCredentialRotationMarkFailedParams,
  ): Promise<IcalCredentialRotationCommandRecord>;

  findCommand(
    tenantId: string,
    commandId: string,
  ): Promise<IcalCredentialRotationCommandRecord | null>;

  findInProgressForConnection(
    tenantId: string,
    connectionId: string,
  ): Promise<IcalCredentialRotationCommandRecord | null>;
}

/**
 * Optional test-only failure injection inside rotation transactions.
 * Production adapters must leave this unset. Hooks may only throw or observe.
 */
export interface IcalCredentialRotationTestHooks {
  afterPhase1Claim?: () => Promise<void>;
  afterCredentialReplace?: () => Promise<void>;
  afterEpochBump?: () => Promise<void>;
  afterCursorBaselineReset?: () => Promise<void>;
  afterSupersede?: () => Promise<void>;
  beforeReceiptCommit?: () => Promise<void>;
}
