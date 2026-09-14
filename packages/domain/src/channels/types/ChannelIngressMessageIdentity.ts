import type { ChannelProviderMessage } from "./ChannelProviderMessage";
import type { ChannelProviderMessageKind } from "./ChannelProviderMessage";

export function readStableProviderEventId(
  payload: Record<string, unknown>,
  messageId: string,
): string | null {
  const providerEventId = payload.providerEventId ?? payload.eventId;
  if (typeof providerEventId === "string" && providerEventId.trim().length > 0) {
    return providerEventId.trim();
  }
  if (messageId.trim().length > 0) {
    return messageId.trim();
  }
  return null;
}

export function readRevisionOrMessageId(message: ChannelProviderMessage): string {
  const revision = message.payload.externalRevision;
  if (typeof revision === "string" && revision.trim().length > 0) {
    return revision.trim();
  }
  return message.messageId.trim();
}

export function isReservationIngressKind(kind: ChannelProviderMessageKind): boolean {
  return (
    kind === "reservation.create" ||
    kind === "reservation.modify" ||
    kind === "reservation.cancel" ||
    kind === "reservation.unknown"
  );
}
