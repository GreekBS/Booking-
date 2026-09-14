import type { ChannelPollResult } from "../../types/ChannelProviderMessage";
import type { ChannelPollExecutionContext } from "../../types/ChannelTransportExecutionContext";

/**
 * Provider-neutral polling contract.
 *
 * The platform may invoke `poll()` at-least-once from the same committed cursor.
 * Providers must tolerate repeated polling from the same cursor position.
 *
 * `ChannelPollResult.nextCursor` is a **proposedNextCursor** — not a committed cursor.
 * The platform commits cursor position only after durable Receive success and CAS.
 */
export interface IChannelPollingProvider {
  poll(
    connectionId: string,
    /** Committed cursor payload owned by the platform (`null` = initial poll). */
    cursor: string | null,
    context: ChannelPollExecutionContext,
  ): Promise<ChannelPollResult>;
}
