import type {
  AvailabilityDelta,
  ExportResult,
} from "../../types/ChannelExportDeltas";
import type { IChannelAvailabilityExportProvider } from "../../ports/providers/IChannelAvailabilityExportProvider";
import type { IBookingComAriClient } from "./ari/IBookingComAriClient";
import { projectAvailabilityDeltaToBookingCom } from "./ari/bookingComAriDelta";
import { batchBookingComAriProjectionByMonth } from "./ari/bookingComAriBatch";
import { classifyBookingComAriPushResult } from "./ari/bookingComAriXml";
import { BookingComHotelId, BookingComRoomTypeId } from "./ids/BookingComIds";

export interface BookingComAvailabilityExportProviderOptions {
  readonly ariClient: IBookingComAriClient;
  readonly resolveHotelAndRoom: (delta: AvailabilityDelta) => {
    hotelId: string;
    roomTypeId: string;
    mappingVersion: number;
    ratePlanId?: string | null;
  };
}

/**
 * Pure Booking.com availability adapter — maps delta → ARI client.
 * Must not import Commerce/Inbox/Prisma. Durable scheduling lives in application UCs.
 */
export class BookingComAvailabilityExportProvider
  implements IChannelAvailabilityExportProvider
{
  constructor(private readonly options: BookingComAvailabilityExportProviderOptions) {}

  async publishAvailability(delta: AvailabilityDelta): Promise<ExportResult> {
    const ids = this.options.resolveHotelAndRoom(delta);
    const projection = projectAvailabilityDeltaToBookingCom({
      delta: delta as AvailabilityDelta & {
        roomsToSell?: number | null;
        closed?: 0 | 1 | null;
      },
      hotelId: BookingComHotelId(ids.hotelId),
      roomTypeId: BookingComRoomTypeId(ids.roomTypeId),
      mappingVersion: ids.mappingVersion,
      generation: delta.revision,
    });

    const batches = batchBookingComAriProjectionByMonth(projection);
    let lastAck: string | undefined;
    for (const batch of batches) {
      const result =
        await this.options.ariClient.pushAvailabilityRatesRestrictions(batch);
      const classification = classifyBookingComAriPushResult(result);
      if (classification !== "full_success") {
        return {
          success: false,
          externalAckId: result.ruid ?? undefined,
          errorCode: result.errors[0]?.code ?? `HTTP_${result.httpStatus}`,
        };
      }
      lastAck = result.ruid ?? lastAck;
    }
    return { success: true, externalAckId: lastAck };
  }
}
