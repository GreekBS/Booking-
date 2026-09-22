import type {
  BookingComHotelId,
  BookingComRatePlanId,
  BookingComRoomTypeId,
} from "../ids/BookingComIds";
import { BookingComHotelId as hotelId, BookingComRatePlanId as rateId, BookingComRoomTypeId as roomId } from "../ids/BookingComIds";

/**
 * Remote discovery contracts (CM-4c-4). Fake/fixture backed — no live HTTP.
 */

export interface BookingComDiscoveredHotel {
  readonly hotelId: BookingComHotelId;
  readonly name: string | null;
}

export interface BookingComDiscoveredRoom {
  readonly hotelId: BookingComHotelId;
  readonly roomTypeId: BookingComRoomTypeId;
  readonly name: string | null;
}

export interface BookingComDiscoveredRatePlan {
  readonly hotelId: BookingComHotelId;
  readonly ratePlanId: BookingComRatePlanId;
  readonly name: string | null;
}

export interface BookingComDiscoveredRoomRate {
  readonly hotelId: BookingComHotelId;
  readonly roomTypeId: BookingComRoomTypeId;
  readonly ratePlanId: BookingComRatePlanId;
  readonly active: boolean;
}

export interface BookingComRemoteDiscoverySnapshot {
  readonly hotel: BookingComDiscoveredHotel | null;
  readonly rooms: readonly BookingComDiscoveredRoom[];
  readonly ratePlans: readonly BookingComDiscoveredRatePlan[];
  readonly roomRates: readonly BookingComDiscoveredRoomRate[];
}

export interface IBookingComRemoteDiscoveryClient {
  discover(hotelId: string): Promise<BookingComRemoteDiscoverySnapshot>;
}

export class BookingComRemoteDiscoveryNotConfiguredError extends Error {
  readonly code = "BOOKING_COM_REMOTE_DISCOVERY_NOT_CONFIGURED";
  constructor() {
    super("Booking.com remote discovery client is not configured (no live HTTP)");
    this.name = "BookingComRemoteDiscoveryNotConfiguredError";
  }
}

export class BookingComRemoteDiscoveryClientNotConfigured
  implements IBookingComRemoteDiscoveryClient
{
  async discover(_hotelId: string): Promise<BookingComRemoteDiscoverySnapshot> {
    void _hotelId;
    throw new BookingComRemoteDiscoveryNotConfiguredError();
  }
}

/** Fixture-backed discovery for tests / local fakes. */
export class FakeBookingComRemoteDiscoveryClient
  implements IBookingComRemoteDiscoveryClient
{
  constructor(
    private readonly snapshot: BookingComRemoteDiscoverySnapshot = defaultFixtureSnapshot(),
  ) {}

  async discover(hotelIdValue: string): Promise<BookingComRemoteDiscoverySnapshot> {
    const expected = this.snapshot.hotel?.hotelId;
    if (expected && expected !== hotelIdValue.trim()) {
      return {
        hotel: null,
        rooms: [],
        ratePlans: [],
        roomRates: [],
      };
    }
    return this.snapshot;
  }
}

export function defaultFixtureSnapshot(): BookingComRemoteDiscoverySnapshot {
  const h = hotelId("8135188");
  const room = roomId("1000202");
  const rate = rateId("12345");
  return {
    hotel: { hotelId: h, name: "Fixture Hotel" },
    rooms: [{ hotelId: h, roomTypeId: room, name: "Double Room" }],
    ratePlans: [{ hotelId: h, ratePlanId: rate, name: "Standard Rate" }],
    roomRates: [
      { hotelId: h, roomTypeId: room, ratePlanId: rate, active: true },
    ],
  };
}
