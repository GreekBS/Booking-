import type { ChannelIngressFailurePhase } from "./ChannelIngressOrchestrationTypes";
import type { ChannelIngressMessageResult } from "./ChannelIngressTypes";

export type ChannelPollReconciliation =
  | "advanced"
  | "already_committed"
  | "deferred_retry"
  | "not_applicable";

export type ChannelPollTransportFailureKind =
  | "unsupported_provider"
  | "invalid_connection"
  | "inactive_connection"
  | "provider_mismatch"
  | "credential_unavailable"
  | "credential_resolution_failed"
  | "poll_failed"
  | "malformed_identity"
  | "provenance_mismatch"
  | "receive_failed"
  | "internal_error";

export type ChannelPollRetryClassification = "none" | "provider_retry" | "transient";

export interface ChannelPollConnectionResult {
  ackAllowed: boolean;
  cursorAdvanced: boolean;
  cursorReconciliation: ChannelPollReconciliation;
  failureKind?: ChannelPollTransportFailureKind;
  failurePhase?: ChannelIngressFailurePhase;
  retryClassification: ChannelPollRetryClassification;
  /** When true, the poll job handler must throw to trigger infrastructure retry. */
  shouldRetryJob: boolean;
  /** Safe for transport/logging — never contains secrets or raw credentials. */
  errorMessage?: string;
  results: ChannelIngressMessageResult[];
  receivedMessageCount: number;
  persistedMessageCount: number;
  proposedNextCursor: string | null;
  loadedCursorVersion: number;
  /**
   * P1-S6a — actual committed cursor version after CAS, or reloaded version on
   * already_committed. Never inferred as loadedCursorVersion + 1.
   */
  committedCursorVersion: number | null;
}
