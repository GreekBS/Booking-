import type {
  BookingComHotelId,
  BookingComRatePlanId,
  BookingComRoomTypeId,
  BookingComRuid,
} from "../ids/BookingComIds";

/**
 * Rates & Availability (ARI) push contracts (CM-4c-1).
 * Runtime Commerce→Outbox→ARI belongs to CM-4c-3.
 *
 * @see https://developers.booking.com/connectivity/docs/ari
 * @see https://developers.booking.com/connectivity/docs/b_xml-availability
 */

export interface BookingComAriDateRange {
  /** Inclusive YYYY-MM-DD or single `value` date. */
  readonly from: string;
  /** Exclusive end date when range; equals from+1 day semantics for single day callers. */
  readonly to: string;
}

export interface BookingComAriAvailabilitySegment {
  readonly roomTypeId: BookingComRoomTypeId;
  readonly dateRange: BookingComAriDateRange;
  /** 0–254; use 255 for unlimited (Booking.com semantics). */
  readonly roomsToSell: number | null;
  /** 1 = closed, 0 = open; null = omit. */
  readonly closed: 0 | 1 | null;
}

export interface BookingComAriRateSegment {
  readonly roomTypeId: BookingComRoomTypeId;
  readonly ratePlanId: BookingComRatePlanId;
  readonly dateRange: BookingComAriDateRange;
  readonly currencyCode: string;
  /** Standard max-occupancy price; null = omit. */
  readonly price: string | null;
  /** Optional standard single-use price (`price1`); null = omit. */
  readonly price1: string | null;
}

export interface BookingComAriRestrictionSegment {
  readonly roomTypeId: BookingComRoomTypeId;
  readonly ratePlanId: BookingComRatePlanId;
  readonly dateRange: BookingComAriDateRange;
  readonly minimumStay: number | null;
  readonly maximumStay: number | null;
  readonly closedToArrival: 0 | 1 | null;
  readonly closedToDeparture: 0 | 1 | null;
}

/**
 * Hotel-scoped ARI request designed for monthly batching + delta updates.
 * Callers should keep one hotel per request (Booking.com recommendation).
 */
export interface BookingComAriPushRequest {
  readonly hotelId: BookingComHotelId;
  /** Calendar month key YYYY-MM for batching metadata (not sent raw). */
  readonly monthKey: string;
  readonly availability: readonly BookingComAriAvailabilitySegment[];
  readonly rates: readonly BookingComAriRateSegment[];
  readonly restrictions: readonly BookingComAriRestrictionSegment[];
}

export interface BookingComAriPushError {
  readonly code: string;
  readonly message: string;
  readonly roomTypeId: string | null;
  readonly ratePlanId: string | null;
  readonly dates: string | null;
}

export interface BookingComAriPushResult {
  readonly success: boolean;
  readonly httpStatus: number;
  readonly ruid: BookingComRuid | null;
  /** Present when Booking.com returns body errors (including HTTP 200 partial failure). */
  readonly errors: readonly BookingComAriPushError[];
  readonly warnings: readonly BookingComAriPushError[];
}

export interface IBookingComAriClient {
  pushAvailabilityRatesRestrictions(
    request: BookingComAriPushRequest,
  ): Promise<BookingComAriPushResult>;
}
