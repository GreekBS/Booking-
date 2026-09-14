import type { ChannelConnection } from "../domain/ChannelConnection";
import type { ChannelProviderMessage } from "../types/ChannelProviderMessage";

export type ChannelIngressProvenanceValidationResult =
  | { ok: true }
  | { ok: false; reason: "provider_mismatch" | "connection_mismatch" };

export function validateParsedMessageProvenance(
  messages: ChannelProviderMessage[],
  connection: ChannelConnection,
  connectionId: string,
): ChannelIngressProvenanceValidationResult {
  for (const message of messages) {
    if (message.provider !== connection.provider) {
      return { ok: false, reason: "provider_mismatch" };
    }
    if (message.connectionId !== connectionId) {
      return { ok: false, reason: "connection_mismatch" };
    }
  }

  return { ok: true };
}
