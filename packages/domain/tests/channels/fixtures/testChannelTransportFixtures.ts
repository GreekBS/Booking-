import type { ChannelProviderMessage } from "../../src/channels/types/ChannelProviderMessage";
import type { ChannelSource } from "../../src/channels/types/ChannelSource";

export const TEST_CHANNEL_TRANSPORT_PROVIDER_ID = "manual" satisfies ChannelSource;

export function buildTransportTestMessage(
  overrides: Partial<ChannelProviderMessage> & Pick<ChannelProviderMessage, "messageId" | "kind">,
): ChannelProviderMessage {
  return {
    messageId: overrides.messageId,
    kind: overrides.kind,
    receivedAt: overrides.receivedAt ?? new Date("2027-06-01T00:00:00.000Z"),
    connectionId: overrides.connectionId ?? "550e8400-e29b-41d4-a716-446655440201",
    provider: overrides.provider ?? TEST_CHANNEL_TRANSPORT_PROVIDER_ID,
    payload: overrides.payload ?? {},
    externalListingId: overrides.externalListingId,
    externalUnitId: overrides.externalUnitId,
    externalReservationId: overrides.externalReservationId,
    externalUpdatedAt: overrides.externalUpdatedAt,
  };
}
