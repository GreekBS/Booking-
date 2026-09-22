import type { IChannelRateRestrictionExportProvider } from "../../../ports/providers/IChannelRateRestrictionExportProvider";
import type {
  ExportResult,
  RateDelta,
  RestrictionDelta,
} from "../../../types/ChannelExportDeltas";
import { BookingComAriNotReadyError } from "./BookingComNotReadyAvailabilityExportProvider";

/**
 * CM-4c-1: rates/restrictions export capability stub. Runtime push is CM-4c-3.
 */
export class BookingComNotReadyRateRestrictionExportProvider
  implements IChannelRateRestrictionExportProvider
{
  async publishRates(_delta: RateDelta): Promise<ExportResult> {
    throw new BookingComAriNotReadyError();
  }

  async publishRestrictions(_delta: RestrictionDelta): Promise<ExportResult> {
    throw new BookingComAriNotReadyError();
  }
}
