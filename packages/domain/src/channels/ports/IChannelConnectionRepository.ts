import type { ChannelConnection } from "../domain/ChannelConnection";
import type { ChannelConnectionStatus } from "../domain/ChannelConnectionStatus";
import type { FeedSemanticMode } from "../types/FeedSemanticMode";

/**
 * Persist validated semantic mode/version with compare-and-set.
 * Does not authorize, confirm, audit, or reset cursors — callers own that.
 */
export interface PersistChannelConnectionSemanticStateParams {
  tenantId: string;
  connectionId: string;
  /** Must equal the currently persisted semantic configuration version. */
  expectedSemanticConfigVersion: number;
  semanticMode: FeedSemanticMode;
  semanticConfigVersion: number;
  updatedAt: Date;
}

/**
 * Persist an aggregate lifecycle status change under semantic-version CAS.
 * The aggregate must already reflect the next status; the repository only writes.
 */
export interface PersistChannelConnectionLifecycleStatusParams {
  tenantId: string;
  connectionId: string;
  expectedSemanticConfigVersion: number;
  expectedStatus: ChannelConnectionStatus;
  nextStatus: ChannelConnectionStatus;
  lastError: string | null;
  updatedAt: Date;
  /** When true, CAS also requires credential_ref IS NOT NULL (activate/resume). */
  requireCredentialRef?: boolean;
  /** Optional fields cleared/written for disconnect-style transitions. */
  credentialRef?: string | null;
  webhookVerificationRef?: string | null;
}

/**
 * ChannelConnection persistence with explicit semantic and lifecycle write boundaries
 * (CM-4b S3c + S3e).
 *
 * - `create` is the only insert path and always stores mixed/version 1.
 * - `saveNonSemanticChanges` never writes `status`, semantic columns, or provider.
 * - `persistSemanticState` is the only path that mutates semantic columns.
 * - Activation/resume helpers are the only paths that may write `status = active`.
 * - Restricted pause/error/disconnect helpers never write `active`.
 * - Activation/resume CAS requires observed semantic version, expected status, and
 *   `credential_ref IS NOT NULL`.
 */
export interface IChannelConnectionRepository {
  create(connection: ChannelConnection): Promise<void>;

  findById(tenantId: string, connectionId: string): Promise<ChannelConnection | null>;

  listByTenant(tenantId: string): Promise<ChannelConnection[]>;

  /**
   * Persist non-semantic profile fields only.
   *
   * Physically omits: `status`, `semantic_mode`, `semantic_config_version`, and `provider`.
   * Lifecycle status must use activate/resume/pause/markError/disconnect helpers.
   * Credential attach that transitions draft|error → pending_auth must use
   * `persistCredentialAttachment`.
   */
  saveNonSemanticChanges(connection: ChannelConnection): Promise<void>;

  /**
   * Persist credential attachment that transitions draft|error → pending_auth.
   * Writes credential_ref, webhook_verification_ref, status=pending_auth, lastError=null.
   * Never writes semantic columns, provider, or status=active.
   */
  persistCredentialAttachment(
    connection: ChannelConnection,
    expectedStatus: ChannelConnectionStatus,
  ): Promise<void>;

  /**
   * Compare-and-set semantic mode and configuration version.
   * Stale expected versions throw ConflictError.
   */
  persistSemanticState(params: PersistChannelConnectionSemanticStateParams): Promise<void>;

  /**
   * Persist activation under status + semantic-version + credential-presence CAS.
   * Only activate/resume helpers may write `status = active`.
   */
  activateWithExpectedSemanticVersion(
    connection: ChannelConnection,
    expectedSemanticConfigVersion: number,
    expectedStatus: ChannelConnectionStatus,
  ): Promise<void>;

  /**
   * Persist resume under status + semantic-version + credential-presence CAS.
   * Only activate/resume helpers may write `status = active`.
   */
  resumeWithExpectedSemanticVersion(
    connection: ChannelConnection,
    expectedSemanticConfigVersion: number,
    expectedStatus: ChannelConnectionStatus,
  ): Promise<void>;

  /**
   * Restricted lifecycle primitive: persist pause under status + semantic-version CAS.
   * Never writes `active`. Not a public product flow — future use cases own audit/TX.
   */
  pauseWithExpectedSemanticVersion(
    connection: ChannelConnection,
    expectedSemanticConfigVersion: number,
    expectedStatus: ChannelConnectionStatus,
  ): Promise<void>;

  /**
   * Restricted lifecycle primitive: persist error under status + semantic-version CAS.
   * Never writes `active`.
   */
  markErrorWithExpectedSemanticVersion(
    connection: ChannelConnection,
    expectedSemanticConfigVersion: number,
    expectedStatus: ChannelConnectionStatus,
  ): Promise<void>;

  /**
   * Restricted lifecycle primitive: persist disconnect under status + semantic-version CAS.
   * Never writes `active`. May clear credential/webhook refs as on the aggregate.
   */
  disconnectWithExpectedSemanticVersion(
    connection: ChannelConnection,
    expectedSemanticConfigVersion: number,
    expectedStatus: ChannelConnectionStatus,
  ): Promise<void>;
}
