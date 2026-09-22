import type {
  ChannelReservationImportContext,
  IChannelReservationImportProvider,
} from "../../../ports/providers/IChannelReservationImportProvider";
import type { ChannelProviderMessage } from "../../../types/ChannelProviderMessage";
import type { ChannelReservationImportMapping } from "../../../types/ChannelReservationImportMapping";

/**
 * CM-4c-1: reservation import port registered for capability parity.
 * Mapping to Commerce commands is CM-4c-2 — always unrecognized here.
 */
export class BookingComNotReadyReservationImportProvider
  implements IChannelReservationImportProvider
{
  async mapMessage(
    _message: ChannelProviderMessage,
    _context: ChannelReservationImportContext,
  ): Promise<ChannelReservationImportMapping> {
    return {
      kind: "unrecognized",
      reason:
        "Booking.com reservation import mapping is not implemented yet (CM-4c-2)",
    };
  }
}
