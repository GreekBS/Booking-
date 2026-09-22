import { ValidationError } from "../../../../shared/errors/DomainError";
import type {
  AvailabilityDelta,
  RateDelta,
  RestrictionDelta,
} from "../../../types/ChannelExportDeltas";
import {
  BookingComHotelId,
  BookingComRatePlanId,
  BookingComRoomTypeId,
} from "../ids/BookingComIds";
import type { BookingComAriResolvedProjection } from "./BookingComAriProjection";
import type { ChannelSource } from "../../../types/ChannelSource";

function assertYmd(value: string, label: string): string {
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    throw new ValidationError(`${label} must be YYYY-MM-DD`);
  }
  return trimmed;
}

/**
 * Map Talos AvailabilityDelta → Booking.com availability segments (delta, not full calendar).
 */
export function projectAvailabilityDeltaToBookingCom(input: {
  delta: AvailabilityDelta & {
    roomsToSell?: number | null;
    closed?: 0 | 1 | null;
  };
  hotelId: string;
  roomTypeId: string;
  mappingVersion: number;
  generation: number;
  inboundOriginProvider?: ChannelSource | null;
  pricingModel?: BookingComAriResolvedProjection["pricingModel"];
}): BookingComAriResolvedProjection {
  const from = assertYmd(input.delta.from, "from");
  const to = assertYmd(input.delta.to, "to");
  const roomsToSell =
    input.delta.roomsToSell === undefined ? null : input.delta.roomsToSell;
  const closed = input.delta.closed === undefined ? null : input.delta.closed;

  return {
    tenantId: input.delta.tenantId,
    connectionId: input.delta.connectionId,
    mappingId: input.delta.mappingId,
    mappingVersion: input.mappingVersion,
    hotelId: BookingComHotelId(input.hotelId),
    roomTypeId: BookingComRoomTypeId(input.roomTypeId),
    ratePlanId: null,
    from,
    to,
    generation: input.generation,
    fieldFamily: "availability",
    availability: [
      {
        roomTypeId: BookingComRoomTypeId(input.roomTypeId),
        dateRange: { from, to },
        roomsToSell,
        closed,
      },
    ],
    rates: [],
    restrictions: [],
    inboundOriginProvider: input.inboundOriginProvider ?? null,
    pricingModel: input.pricingModel ?? "Standard",
  };
}

/**
 * Map Talos RateDelta nightly prices → Booking.com Standard rate segments (one per distinct amount run).
 */
export function projectRateDeltaToBookingCom(input: {
  delta: RateDelta;
  hotelId: string;
  roomTypeId: string;
  ratePlanId: string;
  mappingVersion: number;
  generation: number;
  inboundOriginProvider?: ChannelSource | null;
  pricingModel?: BookingComAriResolvedProjection["pricingModel"];
}): BookingComAriResolvedProjection {
  if (input.pricingModel && input.pricingModel !== "Standard") {
    throw new ValidationError(
      `Booking.com V1 ARI supports Standard pricing only (got ${input.pricingModel})`,
    );
  }
  const roomTypeId = BookingComRoomTypeId(input.roomTypeId);
  const ratePlanId = BookingComRatePlanId(input.ratePlanId);
  const nights = [...input.delta.nightlyRates].sort((a, b) =>
    a.date.localeCompare(b.date),
  );
  if (nights.length === 0) {
    throw new ValidationError("Rate delta requires at least one nightly rate");
  }

  const rates = nights.map((night) => ({
    roomTypeId,
    ratePlanId,
    dateRange: {
      from: assertYmd(night.date, "nightly rate date"),
      to: nextDay(assertYmd(night.date, "nightly rate date")),
    },
    currencyCode: input.delta.currency.trim().toUpperCase(),
    price: night.amount,
    price1: null as string | null,
  }));

  return {
    tenantId: input.delta.tenantId,
    connectionId: input.delta.connectionId,
    mappingId: input.delta.mappingId,
    mappingVersion: input.mappingVersion,
    hotelId: BookingComHotelId(input.hotelId),
    roomTypeId,
    ratePlanId,
    from: assertYmd(input.delta.from, "from"),
    to: assertYmd(input.delta.to, "to"),
    generation: input.generation,
    fieldFamily: "rates",
    availability: [],
    rates,
    restrictions: [],
    inboundOriginProvider: input.inboundOriginProvider ?? null,
    pricingModel: "Standard",
  };
}

export function projectRestrictionDeltaToBookingCom(input: {
  delta: RestrictionDelta;
  hotelId: string;
  roomTypeId: string;
  ratePlanId: string;
  mappingVersion: number;
  generation: number;
  inboundOriginProvider?: ChannelSource | null;
  pricingModel?: BookingComAriResolvedProjection["pricingModel"];
}): BookingComAriResolvedProjection {
  const from = assertYmd(input.delta.from, "from");
  const to = assertYmd(input.delta.to, "to");
  const roomTypeId = BookingComRoomTypeId(input.roomTypeId);
  const ratePlanId = BookingComRatePlanId(input.ratePlanId);

  return {
    tenantId: input.delta.tenantId,
    connectionId: input.delta.connectionId,
    mappingId: input.delta.mappingId,
    mappingVersion: input.mappingVersion,
    hotelId: BookingComHotelId(input.hotelId),
    roomTypeId,
    ratePlanId,
    from,
    to,
    generation: input.generation,
    fieldFamily: "restrictions",
    availability: [],
    rates: [],
    restrictions: [
      {
        roomTypeId,
        ratePlanId,
        dateRange: { from, to },
        minimumStay: input.delta.minStay ?? null,
        maximumStay: input.delta.maxStay ?? null,
        closedToArrival:
          input.delta.closedToArrival === undefined
            ? null
            : input.delta.closedToArrival
              ? 1
              : 0,
        closedToDeparture:
          input.delta.closedToDeparture === undefined
            ? null
            : input.delta.closedToDeparture
              ? 1
              : 0,
      },
    ],
    inboundOriginProvider: input.inboundOriginProvider ?? null,
    pricingModel: input.pricingModel ?? "Standard",
  };
}

function nextDay(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d! + 1));
  return dt.toISOString().slice(0, 10);
}
