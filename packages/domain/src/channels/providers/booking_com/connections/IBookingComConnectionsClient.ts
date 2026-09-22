import type { BookingComHotelId } from "../ids/BookingComIds";

/**
 * Connections API contracts (CM-4c-1).
 * Property initiates in Extranet; provider lists/approves/rejects.
 *
 * @see https://developers.booking.com/connectivity/docs/connections-api/connections-overview
 * @see https://developers.booking.com/connectivity/docs/connections-api/managing-connections-api
 */

/** V1 connection types Talos will request/approve. */
export const BOOKING_COM_V1_CONNECTION_TYPES = [
  "Reservations",
  "AVAILABILITY",
] as const;

export type BookingComConnectionType = (typeof BOOKING_COM_V1_CONNECTION_TYPES)[number];

/**
 * Pricing models Booking.com supports on approve.
 * V1 implements Standard only; OBP/LOS reserved for later without breaking this union.
 */
export type BookingComPricingModel = "Standard" | "OBP" | "LOS" | "Derived";

export const BOOKING_COM_V1_DEFAULT_PRICING_MODEL: BookingComPricingModel = "Standard";

export type BookingComRemoteConnectionState =
  | "pending"
  | "connected"
  | "rejected"
  | "disconnected"
  | "not_found";

export interface BookingComConnectionRequest {
  readonly propertyId: BookingComHotelId;
  readonly requestedConnectionTypes: readonly BookingComConnectionType[];
  readonly requestedPricingModel: BookingComPricingModel | null;
  readonly state: BookingComRemoteConnectionState;
}

export interface BookingComApproveConnectionCommand {
  readonly propertyId: BookingComHotelId;
  /** Must match request when supplied; V1 always Reservations + AVAILABILITY. */
  readonly connectionTypes: readonly BookingComConnectionType[];
  /** V1: Standard only. */
  readonly pricingModel: BookingComPricingModel;
}

export interface BookingComRejectConnectionCommand {
  readonly propertyId: BookingComHotelId;
}

export interface BookingComConnectionSnapshot {
  readonly propertyId: BookingComHotelId;
  readonly state: BookingComRemoteConnectionState;
  readonly connectionTypes: readonly BookingComConnectionType[];
  readonly pricingModel: BookingComPricingModel | null;
}

export interface IBookingComConnectionsClient {
  listPendingRequests(): Promise<readonly BookingComConnectionRequest[]>;
  getConnection(propertyId: BookingComHotelId): Promise<BookingComConnectionSnapshot | null>;
  approve(command: BookingComApproveConnectionCommand): Promise<BookingComConnectionSnapshot>;
  reject(command: BookingComRejectConnectionCommand): Promise<void>;
}
