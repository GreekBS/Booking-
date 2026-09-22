import type { IChannelAvailabilityExportProvider } from "../../../ports/providers/IChannelAvailabilityExportProvider";
import type { AvailabilityDelta, ExportResult } from "../../../types/ChannelExportDeltas";
import { DomainError } from "../../../../shared/errors/DomainError";

export class BookingComAriNotReadyError extends DomainError {
  static readonly CODE = "BOOKING_COM_ARI_NOT_READY" as const;

  constructor() {
    super(
      "Booking.com ARI export is not implemented yet (CM-4c-3)",
      BookingComAriNotReadyError.CODE,
    );
  }
}

/**
 * CM-4c-1: availability export capability stub. Runtime push is CM-4c-3.
 */
export class BookingComNotReadyAvailabilityExportProvider
  implements IChannelAvailabilityExportProvider
{
  async publishAvailability(_delta: AvailabilityDelta): Promise<ExportResult> {
    throw new BookingComAriNotReadyError();
  }
}
