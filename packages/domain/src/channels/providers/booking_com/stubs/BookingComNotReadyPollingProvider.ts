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
    _connectionId: string,
    _cursor: string | null,
    _context: ChannelPollExecutionContext,
  ): Promise<ChannelPollResult> {
    throw new ChannelPollingNotReadyError("booking_com");
  }
}
