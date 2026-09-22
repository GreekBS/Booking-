import type { ChannelSource } from "../types/ChannelSource";

/**
 * Generic origin-aware outbound suppression (not Booking.com-hardcoded into Commerce).
 * When inventory changed because of an inbound channel reservation, do not echo
 * ARI back to the same provider connection.
 */
export function shouldSuppressChannelOutboundEcho(input: {
  outboundProvider: ChannelSource;
  inboundOriginProvider: ChannelSource | null | undefined;
}): boolean {
  if (!input.inboundOriginProvider) return false;
  return input.inboundOriginProvider === input.outboundProvider;
}
