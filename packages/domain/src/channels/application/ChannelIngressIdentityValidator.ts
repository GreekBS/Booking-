import type { ChannelProviderMessage } from "../types/ChannelProviderMessage";
import type { ChannelProviderMessageKind } from "../types/ChannelProviderMessage";
import {
  isReservationIngressKind,
  readStableProviderEventId,
} from "../types/ChannelIngressMessageIdentity";

export const ALLOWED_INGRESS_MESSAGE_KINDS = [
  "reservation.create",
  "reservation.modify",
  "reservation.cancel",
  "reservation.unknown",
  "connectivity.test",
] as const satisfies readonly ChannelProviderMessageKind[];

const ALLOWED_KIND_SET = new Set<string>(ALLOWED_INGRESS_MESSAGE_KINDS);

export type ChannelIngressIdentityValidationResult =
  | { ok: true }
  | { ok: false; errorMessage: string };

export function validateKnownIngressMessageKinds(
  messages: ChannelProviderMessage[],
): ChannelIngressIdentityValidationResult {
  for (const message of messages) {
    if (!ALLOWED_KIND_SET.has(message.kind)) {
      return {
        ok: false,
        errorMessage: `Unsupported ingress message kind: ${String(message.kind)}`,
      };
    }
  }

  return { ok: true };
}

export function validateParsedMessageIdentities(
  messages: ChannelProviderMessage[],
): ChannelIngressIdentityValidationResult {
  for (const message of messages) {
    if (message.kind === "reservation.create") {
      if (!message.externalReservationId?.trim()) {
        return { ok: false, errorMessage: "External reservation id is required for create events" };
      }
      continue;
    }

    if (message.kind === "reservation.modify" || message.kind === "reservation.cancel") {
      if (!message.externalReservationId?.trim()) {
        return {
          ok: false,
          errorMessage: `External reservation id is required for ${message.kind} events`,
        };
      }
      continue;
    }

    if (message.kind === "reservation.unknown") {
      const eventId = readStableProviderEventId(message.payload, message.messageId);
      if (!eventId) {
        return {
          ok: false,
          errorMessage: "Stable provider event identity is required for unknown reservation events",
        };
      }
      continue;
    }

    if (message.kind === "connectivity.test") {
      const eventId = readStableProviderEventId(message.payload, message.messageId);
      if (!eventId) {
        return {
          ok: false,
          errorMessage: "Stable event identity is required for connectivity test events",
        };
      }
      continue;
    }

    if (isReservationIngressKind(message.kind)) {
      return { ok: false, errorMessage: `Unsupported reservation kind: ${message.kind}` };
    }
  }

  return { ok: true };
}

export function selectMessagesForReceive(
  messages: ChannelProviderMessage[],
  connectivityTestIngress: "receive" | "ack_without_persist",
): ChannelProviderMessage[] {
  const selected: ChannelProviderMessage[] = [];

  for (const message of messages) {
    if (isReservationIngressKind(message.kind)) {
      selected.push(message);
      continue;
    }

    if (message.kind === "connectivity.test" && connectivityTestIngress === "receive") {
      selected.push(message);
    }
  }

  return selected;
}
