import type { ChannelProviderMessage } from "../types/ChannelProviderMessage";
import type { ChannelSource } from "../types/ChannelSource";
import type { ChannelInboxIngressKind } from "./ChannelInboxIngressKind";
import type { ChannelInboxProcessingOutcome } from "./ChannelInboxProcessingOutcome";
import type { ChannelInboxProcessingStatus } from "./ChannelInboxProcessingStatus";
import { ChannelInboxDeduplicationKey } from "./value-objects/ChannelInboxDeduplicationKey";

export interface ChannelInboxItemProps {
  id: string;
  tenantId: string;
  connectionId: string;
  provider: ChannelSource;
  ingressKind: ChannelInboxIngressKind;
  messageKind: ChannelProviderMessage["kind"];
  providerEventId: string;
  deduplicationKey: string;
  correlationId: string | null;
  rawPayload: Record<string, unknown>;
  externalListingId: string | null;
  externalUnitId: string | null;
  externalReservationId: string | null;
  externalRevision: string | null;
  providerRevision: string | null;
  providerSequence: string | null;
  providerEventTime: Date | null;
  receivedAt: Date;
  createdAt: Date;
  status: ChannelInboxProcessingStatus;
  outcome: ChannelInboxProcessingOutcome | null;
  outcomeDetail: string | null;
  attemptCount: number;
  lastError: string | null;
  leaseOwner: string | null;
  leaseExpiresAt: Date | null;
  leaseHeartbeatAt: Date | null;
  processingToken: string | null;
  processingStartedAt: Date | null;
  processedAt: Date | null;
  resultBookingId: string | null;
  resultLinkId: string | null;
  updatedAt: Date;
}

export interface CreateChannelInboxItemInput {
  id: string;
  tenantId: string;
  connectionId: string;
  provider: ChannelSource;
  ingressKind: ChannelInboxIngressKind;
  message: ChannelProviderMessage;
  deduplicationKey: ChannelInboxDeduplicationKey;
  correlationId?: string | null;
  now?: Date;
}

export class ChannelInboxItem {
  private constructor(private readonly props: ChannelInboxItemProps) {}

  static createNew(input: CreateChannelInboxItemInput): ChannelInboxItem {
    const now = input.now ?? new Date();
    const payload = serializeProviderMessage(input.message);
    const externalRevision =
      typeof input.message.payload.externalRevision === "string"
        ? input.message.payload.externalRevision
        : null;

    return new ChannelInboxItem({
      id: input.id,
      tenantId: input.tenantId,
      connectionId: input.connectionId,
      provider: input.provider,
      ingressKind: input.ingressKind,
      messageKind: input.message.kind,
      providerEventId: input.message.messageId,
      deduplicationKey: input.deduplicationKey.value,
      correlationId: input.correlationId ?? null,
      rawPayload: payload,
      externalListingId: input.message.externalListingId ?? null,
      externalUnitId: input.message.externalUnitId ?? null,
      externalReservationId: input.message.externalReservationId ?? null,
      externalRevision,
      providerRevision: null,
      providerSequence: null,
      providerEventTime: null,
      receivedAt: input.message.receivedAt,
      createdAt: now,
      status: "received",
      outcome: null,
      outcomeDetail: null,
      attemptCount: 0,
      lastError: null,
      leaseOwner: null,
      leaseExpiresAt: null,
      leaseHeartbeatAt: null,
      processingToken: null,
      processingStartedAt: null,
      processedAt: null,
      resultBookingId: null,
      resultLinkId: null,
      updatedAt: now,
    });
  }

  static reconstitute(props: ChannelInboxItemProps): ChannelInboxItem {
    return new ChannelInboxItem(props);
  }

  get id(): string {
    return this.props.id;
  }

  get tenantId(): string {
    return this.props.tenantId;
  }

  get connectionId(): string {
    return this.props.connectionId;
  }

  get provider(): ChannelSource {
    return this.props.provider;
  }

  get ingressKind(): ChannelInboxIngressKind {
    return this.props.ingressKind;
  }

  get messageKind(): ChannelProviderMessage["kind"] {
    return this.props.messageKind;
  }

  get deduplicationKey(): string {
    return this.props.deduplicationKey;
  }

  get correlationId(): string | null {
    return this.props.correlationId;
  }

  get rawPayload(): Record<string, unknown> {
    return this.props.rawPayload;
  }

  get status(): ChannelInboxProcessingStatus {
    return this.props.status;
  }

  get outcome(): ChannelInboxProcessingOutcome | null {
    return this.props.outcome;
  }

  get attemptCount(): number {
    return this.props.attemptCount;
  }

  get processingToken(): string | null {
    return this.props.processingToken;
  }

  get leaseOwner(): string | null {
    return this.props.leaseOwner;
  }

  get leaseExpiresAt(): Date | null {
    return this.props.leaseExpiresAt;
  }

  get resultBookingId(): string | null {
    return this.props.resultBookingId;
  }

  get resultLinkId(): string | null {
    return this.props.resultLinkId;
  }

  toProps(): ChannelInboxItemProps {
    return { ...this.props };
  }
}

export function serializeProviderMessage(message: ChannelProviderMessage): Record<string, unknown> {
  return {
    messageId: message.messageId,
    kind: message.kind,
    receivedAt: message.receivedAt.toISOString(),
    connectionId: message.connectionId,
    provider: message.provider,
    payload: message.payload,
    externalListingId: message.externalListingId,
    externalUnitId: message.externalUnitId,
    externalReservationId: message.externalReservationId,
    externalUpdatedAt: message.externalUpdatedAt,
  };
}
