import type { ChannelImportPayload } from "./ChannelTypes";
import type { ChannelSource } from "./ChannelSource";

export type ChannelProviderMessageKind =
  | "reservation.create"
  | "reservation.modify"
  | "reservation.cancel"
  | "reservation.unknown"
  | "connectivity.test";

export interface ChannelProviderMessage {
  messageId: string;
  kind: ChannelProviderMessageKind;
  receivedAt: Date;
  connectionId: string;
  provider: ChannelSource;
  payload: ChannelImportPayload;
  externalListingId?: string;
  externalUnitId?: string;
  externalReservationId?: string;
  externalUpdatedAt?: string;
}

export interface ChannelPollResult {
  messages: ChannelProviderMessage[];
  /**
   * Proposed next poll position (proposedNextCursor).
   * NOT committed — the platform commits only after durable Receive and CAS.
   */
  nextCursor: string | null;
}

export type ChannelWebhookVerificationResult =
  | { accepted: true; connectionId: string }
  | {
      accepted: false;
      reason: "invalid_signature" | "unknown_connection" | "replay";
    };
