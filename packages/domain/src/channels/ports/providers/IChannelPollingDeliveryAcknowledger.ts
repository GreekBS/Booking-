import type { ChannelProviderMessage } from "../../types/ChannelProviderMessage";

/**
 * Optional post-Receive ACK for providers that acknowledge remote queues
 * only after durable ingress (e.g. Booking.com OTA).
 */
export interface IChannelPollingDeliveryAcknowledger {
  acknowledgeDelivered(params: {
    connectionId: string;
    messages: readonly ChannelProviderMessage[];
    credentialMaterial?: Record<string, string>;
  }): Promise<void>;
}

export function isChannelPollingDeliveryAcknowledger(
  value: unknown,
): value is IChannelPollingDeliveryAcknowledger {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as IChannelPollingDeliveryAcknowledger).acknowledgeDelivered ===
      "function"
  );
}
