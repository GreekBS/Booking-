import { ValidationError } from "../../../shared/errors/DomainError";
import type { ChannelProviderMessage } from "../../types/ChannelProviderMessage";
import {
  readRevisionOrMessageId,
  readStableProviderEventId,
} from "../../types/ChannelIngressMessageIdentity";

export class ChannelInboxDeduplicationKey {
  private constructor(public readonly value: string) {}

  static forCreate(connectionId: string, externalReservationId: string): ChannelInboxDeduplicationKey {
    const connection = normalizeRequired(connectionId, "Connection id");
    const externalId = normalizeRequired(externalReservationId, "External reservation id");
    return new ChannelInboxDeduplicationKey(`ingress:create:${connection}:${externalId}`);
  }

  static forModify(
    connectionId: string,
    externalReservationId: string,
    revisionOrMessageId: string,
  ): ChannelInboxDeduplicationKey {
    const connection = normalizeRequired(connectionId, "Connection id");
    const externalId = normalizeRequired(externalReservationId, "External reservation id");
    const revision = normalizeRequired(revisionOrMessageId, "Revision or message id");
    return new ChannelInboxDeduplicationKey(`ingress:modify:${connection}:${externalId}:${revision}`);
  }

  static forCancel(
    connectionId: string,
    externalReservationId: string,
    revisionOrMessageId: string,
  ): ChannelInboxDeduplicationKey {
    const connection = normalizeRequired(connectionId, "Connection id");
    const externalId = normalizeRequired(externalReservationId, "External reservation id");
    const revision = normalizeRequired(revisionOrMessageId, "Revision or message id");
    return new ChannelInboxDeduplicationKey(`ingress:cancel:${connection}:${externalId}:${revision}`);
  }

  static forUnknown(connectionId: string, providerEventIdOrMessageId: string): ChannelInboxDeduplicationKey {
    const connection = normalizeRequired(connectionId, "Connection id");
    const eventId = normalizeRequired(providerEventIdOrMessageId, "Provider event id or message id");
    return new ChannelInboxDeduplicationKey(`ingress:unknown:${connection}:${eventId}`);
  }

  /** Provider-1 P1-S5 — fixed-length hashed iCal ingress dedup identity (80 chars). */
  static forIcalIngressDigestV1(digestHex: string): ChannelInboxDeduplicationKey {
    const digest = normalizeRequired(digestHex, "iCal ingress digest");
    if (!/^[0-9a-f]{64}$/.test(digest)) {
      throw new ValidationError("iCal ingress digest must be 64 lowercase hex characters");
    }
    const value = `ingress:ical:v1:${digest}`;
    if (value.length !== 80) {
      throw new ValidationError("iCal ingress dedup key length invariant violated");
    }
    return new ChannelInboxDeduplicationKey(value);
  }

  static forMaintenanceEvent(
    connectionId: string,
    kind: string,
    providerEventIdOrMessageId: string,
  ): ChannelInboxDeduplicationKey {
    const connection = normalizeRequired(connectionId, "Connection id");
    const eventKind = normalizeRequired(kind, "Maintenance event kind");
    const eventId = normalizeRequired(providerEventIdOrMessageId, "Provider event id or message id");
    return new ChannelInboxDeduplicationKey(
      `ingress:maintenance:${connection}:${eventKind}:${eventId}`,
    );
  }

  static forReservationEvent(
    connectionId: string,
    message: ChannelProviderMessage,
  ): ChannelInboxDeduplicationKey {
    switch (message.kind) {
      case "reservation.create":
        return ChannelInboxDeduplicationKey.forCreate(
          connectionId,
          normalizeRequired(message.externalReservationId ?? "", "External reservation id"),
        );
      case "reservation.modify":
        return ChannelInboxDeduplicationKey.forModify(
          connectionId,
          normalizeRequired(message.externalReservationId ?? "", "External reservation id"),
          readRevisionOrMessageId(message),
        );
      case "reservation.cancel":
        return ChannelInboxDeduplicationKey.forCancel(
          connectionId,
          normalizeRequired(message.externalReservationId ?? "", "External reservation id"),
          readRevisionOrMessageId(message),
        );
      case "reservation.unknown": {
        const eventId = readStableProviderEventId(message.payload, message.messageId);
        if (!eventId) {
          throw new ValidationError("Stable provider event identity is required for unknown events");
        }
        return ChannelInboxDeduplicationKey.forUnknown(connectionId, eventId);
      }
      default:
        throw new ValidationError(`Unsupported reservation kind for deduplication: ${message.kind}`);
    }
  }

  static forIngressMessage(
    connectionId: string,
    message: ChannelProviderMessage,
  ): ChannelInboxDeduplicationKey {
    if (message.kind === "connectivity.test") {
      const eventId = readStableProviderEventId(message.payload, message.messageId);
      if (!eventId) {
        throw new ValidationError("Stable event identity is required for maintenance events");
      }
      return ChannelInboxDeduplicationKey.forMaintenanceEvent(connectionId, message.kind, eventId);
    }

    return ChannelInboxDeduplicationKey.forReservationEvent(connectionId, message);
  }

  static forReplay(sourceInboxItemId: string, replaySequence: number): ChannelInboxDeduplicationKey {
    const sourceId = normalizeRequired(sourceInboxItemId, "Source inbox item id");
    if (!Number.isInteger(replaySequence) || replaySequence < 1) {
      throw new ValidationError("Replay sequence must be a positive integer");
    }
    return new ChannelInboxDeduplicationKey(`ingress:replay:${sourceId}:${replaySequence}`);
  }

  static reconstitute(value: string): ChannelInboxDeduplicationKey {
    return new ChannelInboxDeduplicationKey(value);
  }
}

function normalizeRequired(value: string, label: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new ValidationError(`${label} is required`);
  }
  return trimmed;
}
