import type { ChannelSource } from "../types/ChannelSource";
import type { MutationOrigin } from "../../shared/types/MutationOrigin";

/**
 * Origin-aware outbound suppression (generic — not Booking.com-hardcoded into Commerce).
 *
 * Suppression is CONNECTION-specific: only the originating connection is suppressed.
 * Two Booking.com connections are independent. A later OPERATOR mutation is not suppressed
 * merely because the Booking once originated from a channel.
 */
export function shouldSuppressChannelOutboundEcho(input: {
  outboundProvider: ChannelSource;
  outboundConnectionId?: string;
  mutationOrigin?: MutationOrigin | null | undefined;
  /** @deprecated Prefer mutationOrigin.channel.connectionId */
  inboundOriginProvider?: ChannelSource | null | undefined;
}): boolean {
  const origin = input.mutationOrigin;
  if (origin?.kind === "channel" && origin.channel?.connectionId) {
    if (!input.outboundConnectionId) return false;
    return origin.channel.connectionId === input.outboundConnectionId;
  }
  // Legacy provider-only path (older call sites / tests without connection id)
  if (input.inboundOriginProvider && !origin?.channel?.connectionId) {
    return input.inboundOriginProvider === input.outboundProvider;
  }
  return false;
}
