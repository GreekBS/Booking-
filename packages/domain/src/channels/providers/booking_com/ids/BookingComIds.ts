import { ValidationError } from "../../../../shared/errors/DomainError";

/**
 * Booking.com Connectivity identifiers (provider boundary).
 * Values are opaque positive integer strings matching Booking.com hotel/room/rate IDs.
 * @see https://developers.booking.com/connectivity/docs/room-type-and-rate-plan-management/managing-roomrates
 */

function assertNonEmptyTrimmed(label: string, value: string): string {
  if (typeof value !== "string") {
    throw new ValidationError(`${label} must be a string`);
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new ValidationError(`${label} must be non-empty`);
  }
  if (trimmed.length > 64) {
    throw new ValidationError(`${label} exceeds maximum length`);
  }
  return trimmed;
}

/** Booking.com property / hotel id (`hotel_id` / HotelCode). */
export type BookingComHotelId = string & { readonly __brand: "BookingComHotelId" };

export function BookingComHotelId(value: string): BookingComHotelId {
  return assertNonEmptyTrimmed("BookingComHotelId", value) as BookingComHotelId;
}

/** Booking.com room type id (`InvTypeCode` / room id). */
export type BookingComRoomTypeId = string & { readonly __brand: "BookingComRoomTypeId" };

export function BookingComRoomTypeId(value: string): BookingComRoomTypeId {
  return assertNonEmptyTrimmed("BookingComRoomTypeId", value) as BookingComRoomTypeId;
}

/** Booking.com rate plan id (`RatePlanCode` / rate id). */
export type BookingComRatePlanId = string & { readonly __brand: "BookingComRatePlanId" };

export function BookingComRatePlanId(value: string): BookingComRatePlanId {
  return assertNonEmptyTrimmed("BookingComRatePlanId", value) as BookingComRatePlanId;
}

/** Room + rate product identity used by ARI and reservations. */
export interface BookingComRoomRateId {
  readonly hotelId: BookingComHotelId;
  readonly roomTypeId: BookingComRoomTypeId;
  readonly ratePlanId: BookingComRatePlanId;
}

export function BookingComRoomRateId(input: {
  hotelId: string;
  roomTypeId: string;
  ratePlanId: string;
}): BookingComRoomRateId {
  return {
    hotelId: BookingComHotelId(input.hotelId),
    roomTypeId: BookingComRoomTypeId(input.roomTypeId),
    ratePlanId: BookingComRatePlanId(input.ratePlanId),
  };
}

/** Booking.com reservation id (external reservation identity). */
export type BookingComReservationId = string & {
  readonly __brand: "BookingComReservationId";
};

export function BookingComReservationId(value: string): BookingComReservationId {
  return assertNonEmptyTrimmed("BookingComReservationId", value) as BookingComReservationId;
}

/**
 * Booking.com response unique id (RUID) — support correlation only.
 * Never treat as a secret; still do not log adjacent credentials.
 */
export type BookingComRuid = string & { readonly __brand: "BookingComRuid" };

export function BookingComRuid(value: string): BookingComRuid {
  return assertNonEmptyTrimmed("BookingComRuid", value) as BookingComRuid;
}
