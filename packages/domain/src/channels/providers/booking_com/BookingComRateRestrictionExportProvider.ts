import type {
  ExportResult,
  RateDelta,
  RestrictionDelta,
} from "../../types/ChannelExportDeltas";
import type { IChannelRateRestrictionExportProvider } from "../../ports/providers/IChannelRateRestrictionExportProvider";
import type { IBookingComAriClient } from "./ari/IBookingComAriClient";
import {
  projectRateDeltaToBookingCom,
  projectRestrictionDeltaToBookingCom,
} from "./ari/bookingComAriDelta";
import { batchBookingComAriProjectionByMonth } from "./ari/bookingComAriBatch";
import { classifyBookingComAriPushResult } from "./ari/bookingComAriXml";
import {
  BookingComHotelId,
  BookingComRatePlanId,
  BookingComRoomTypeId,
} from "./ids/BookingComIds";
import { ValidationError } from "../../../shared/errors/DomainError";

export interface BookingComRateRestrictionExportProviderOptions {
  readonly ariClient: IBookingComAriClient;
  readonly resolveHotelRoomRate: (delta: RateDelta | RestrictionDelta) => {
    hotelId: string;
    roomTypeId: string;
    ratePlanId: string;
    mappingVersion: number;
    pricingModel?: "Standard" | "OBP" | "LOS" | "Derived";
  };
}

/**
 * Pure Booking.com rates/restrictions adapter (Standard pricing only).
 */
export class BookingComRateRestrictionExportProvider
  implements IChannelRateRestrictionExportProvider
{
  constructor(
    private readonly options: BookingComRateRestrictionExportProviderOptions,
  ) {}

  async publishRates(delta: RateDelta): Promise<ExportResult> {
    const ids = this.options.resolveHotelRoomRate(delta);
    if (ids.pricingModel && ids.pricingModel !== "Standard") {
      throw new ValidationError(
        `Booking.com V1 ARI supports Standard pricing only (got ${ids.pricingModel})`,
      );
    }
    const projection = projectRateDeltaToBookingCom({
      delta,
      hotelId: BookingComHotelId(ids.hotelId),
      roomTypeId: BookingComRoomTypeId(ids.roomTypeId),
      ratePlanId: BookingComRatePlanId(ids.ratePlanId),
      mappingVersion: ids.mappingVersion,
      generation: Date.parse(delta.from) || 1,
      pricingModel: "Standard",
    });
    return this.pushAll(projection);
  }

  async publishRestrictions(delta: RestrictionDelta): Promise<ExportResult> {
    const ids = this.options.resolveHotelRoomRate(delta);
    if (ids.pricingModel && ids.pricingModel !== "Standard") {
      throw new ValidationError(
        `Booking.com V1 ARI supports Standard pricing only (got ${ids.pricingModel})`,
      );
    }
    const projection = projectRestrictionDeltaToBookingCom({
      delta,
      hotelId: BookingComHotelId(ids.hotelId),
      roomTypeId: BookingComRoomTypeId(ids.roomTypeId),
      ratePlanId: BookingComRatePlanId(ids.ratePlanId),
      mappingVersion: ids.mappingVersion,
      generation: Date.parse(delta.from) || 1,
      pricingModel: "Standard",
    });
    return this.pushAll(projection);
  }

  private async pushAll(
    projection: ReturnType<typeof projectRateDeltaToBookingCom>,
  ): Promise<ExportResult> {
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
