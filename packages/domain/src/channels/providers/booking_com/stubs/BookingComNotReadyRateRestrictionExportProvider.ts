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
  async publishRates(delta: RateDelta): Promise<ExportResult> {
    void delta;
    throw new BookingComAriNotReadyError();
  }

  async publishRestrictions(delta: RestrictionDelta): Promise<ExportResult> {
    void delta;
    throw new BookingComAriNotReadyError();
  }
}
