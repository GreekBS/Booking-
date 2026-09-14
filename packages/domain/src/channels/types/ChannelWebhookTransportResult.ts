import type { ChannelIngressFailurePhase } from "./ChannelIngressOrchestrationTypes";
import type { ChannelIngressMessageResult } from "./ChannelIngressTypes";

export type ChannelWebhookAckClassification = "ack_allowed" | "ack_denied";

export type ChannelWebhookTransportFailureKind =
  | "unsupported_provider"
  | "invalid_connection"
  | "inactive_connection"
  | "provider_mismatch"
  | "credential_unavailable"
  | "credential_resolution_failed"
  | "verification_failed"
  | "parse_failed"
  | "malformed_identity"
  | "provenance_mismatch"
  | "receive_failed"
  | "internal_error";

export type ChannelWebhookRetryClassification = "none" | "provider_retry" | "transient";

export interface ChannelWebhookTransportResult {
  ackAllowed: boolean;
  ackClassification: ChannelWebhookAckClassification;
  failureKind?: ChannelWebhookTransportFailureKind;
  failurePhase?: ChannelIngressFailurePhase;
  retryClassification: ChannelWebhookRetryClassification;
  /** Safe for transport/logging — never contains secrets or raw credentials. */
  errorMessage?: string;
  results: ChannelIngressMessageResult[];
  receivedMessageCount: number;
  persistedMessageCount: number;
}
