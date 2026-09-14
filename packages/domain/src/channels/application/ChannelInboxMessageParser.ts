import { ValidationError } from "../../shared/errors/DomainError";
import type { ChannelProviderMessage } from "../types/ChannelProviderMessage";
import type { ChannelProviderMessageKind } from "../types/ChannelProviderMessage";
import type { ChannelSource } from "../types/ChannelSource";

export function parseChannelInboxRawPayload(rawPayload: Record<string, unknown>): ChannelProviderMessage {
  const messageId = readString(rawPayload.messageId, "messageId");
  const kind = readMessageKind(rawPayload.kind);
  const receivedAtRaw = readString(rawPayload.receivedAt, "receivedAt");
  const receivedAt = new Date(receivedAtRaw);
  if (Number.isNaN(receivedAt.getTime())) {
    throw new ValidationError("Invalid receivedAt in inbox raw payload");
  }
  const connectionId = readString(rawPayload.connectionId, "connectionId");
  const provider = readString(rawPayload.provider, "provider") as ChannelSource;
  const payload = rawPayload.payload;
  if (payload == null || typeof payload !== "object" || Array.isArray(payload)) {
    throw new ValidationError("Invalid payload in inbox raw payload");
  }

  return {
    messageId,
    kind,
    receivedAt,
    connectionId,
    provider,
    payload: payload as ChannelProviderMessage["payload"],
    externalListingId: readOptionalString(rawPayload.externalListingId),
    externalUnitId: readOptionalString(rawPayload.externalUnitId),
    externalReservationId: readOptionalString(rawPayload.externalReservationId),
    externalUpdatedAt: readOptionalString(rawPayload.externalUpdatedAt),
  };
}

function readMessageKind(value: unknown): ChannelProviderMessageKind {
  const kind = readString(value, "kind");
  if (
    kind === "reservation.create" ||
    kind === "reservation.modify" ||
    kind === "reservation.cancel" ||
    kind === "reservation.unknown" ||
    kind === "connectivity.test"
  ) {
    return kind;
  }
  throw new ValidationError(`Unsupported message kind in inbox raw payload: ${kind}`);
}

function readString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ValidationError(`Missing ${field} in inbox raw payload`);
  }
  return value;
}

function readOptionalString(value: unknown): string | undefined {
  if (value == null) {
    return undefined;
  }
  if (typeof value !== "string" || value.trim().length === 0) {
    return undefined;
  }
  return value;
}
