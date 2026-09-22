import { ChannelPollingNotReadyError } from "../../../errors/ChannelPollingNotReadyError";
import type { IChannelPollingProvider } from "../../../ports/providers/IChannelPollingProvider";
import type { ChannelPollResult } from "../../../types/ChannelProviderMessage";
import type { ChannelPollExecutionContext } from "../../../types/ChannelTransportExecutionContext";

/**
 * CM-4c-1: discoverable Booking.com polling port that fails closed until CM-4c-2
 * wires OTA retrieve → ReceiveChannelEventUseCase.
 */
export class BookingComNotReadyPollingProvider implements IChannelPollingProvider {
  async poll(
    connectionId: string,
    cursor: string | null,
    context: ChannelPollExecutionContext,
  ): Promise<ChannelPollResult> {
    void connectionId;
    void cursor;
    void context;
    throw new ChannelPollingNotReadyError("booking_com");
  }
}
