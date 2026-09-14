import type { FeedSemanticMode } from "../types/FeedSemanticMode";
import type { ChannelSemanticModeTransitionOperation } from "../application/semanticModeTransitionFingerprint";

/**
 * Provider-neutral semantic transition command (CM-4b S3d).
 * No HTTP, iCal, credentials, Booking, Inbox, or raw feed payload fields.
 */
export interface SemanticModeTransitionCommand {
  tenantId: string;
  connectionId: string;
  commandId: string;
  operation: ChannelSemanticModeTransitionOperation;
  actorId: string;
  expectedFromMode: FeedSemanticMode;
  targetSemanticMode: FeedSemanticMode;
  expectedSemanticConfigVersion: number;
  /**
   * Snapshot of the current provider registration allow-list (Option B).
   * Revalidated inside the transition transaction; not part of the fingerprint.
   */
  allowedFeedSemanticModes: readonly FeedSemanticMode[];
  /** Optional non-secret operator reason (audited; fingerprinted via digest). */
  reason?: string | null;
  ipAddress?: string | null;
  /** Wall clock for committedAt / updatedAt; excluded from fingerprint. */
  now?: Date;
}

export interface SemanticModeTransitionResult {
  tenantId: string;
  connectionId: string;
  commandId: string;
  previousMode: FeedSemanticMode;
  newMode: FeedSemanticMode;
  previousSemanticConfigVersion: number;
  newSemanticConfigVersion: number;
  changed: boolean;
  cursorReset: boolean;
  committedAt: Date;
  /** True when an existing committed receipt was replayed. */
  replayed: boolean;
}

/**
 * Atomic semantic-mode transition store.
 * PostgreSQL adapter owns one shared transaction; in-memory provides logical parity.
 */
export interface IChannelSemanticModeTransitionStore {
  executeTransition(
    command: SemanticModeTransitionCommand,
  ): Promise<SemanticModeTransitionResult>;
}

/**
 * Optional test-only failure injection points inside the transition transaction.
 * Production adapters must leave this unset. Hooks may only throw or observe;
 * they cannot alter command input, skip CAS, suppress writes, or force commit.
 */
export interface SemanticModeTransitionTestHooks {
  afterReceiptAcquired?: () => Promise<void>;
  afterSemanticPersist?: () => Promise<void>;
  afterCursorReset?: () => Promise<void>;
  afterAudit?: () => Promise<void>;
  /** Invoked after audit (when changed) and immediately before receipt commit. */
  beforeReceiptCommit?: () => Promise<void>;
}
