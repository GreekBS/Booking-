import type {
  BookingComHotelId,
  BookingComReservationId,
  BookingComRuid,
} from "../ids/BookingComIds";

/**
 * OTA Reservations API contracts (CM-4c-1).
 * Runtime poll/ACK belongs to CM-4c-2. These ports preserve identity for
 * dedupe, evidence, ACK, ordering, and reconciliation.
 *
 * @see https://developers.booking.com/connectivity/docs/reservations-api/reservations-overview
 * @see https://developers.booking.com/connectivity/docs/reservations-api/retrieving-new-reservations-ota
 */

export type BookingComReservationMessageKind = "create" | "modify" | "cancel";

/**
 * Provider-side reservation message before CM-3c ChannelProviderMessage mapping.
 * Raw XML is immutable evidence — never mutate after capture.
 */
export interface BookingComReservationMessage {
  readonly kind: BookingComReservationMessageKind;
  /** Opaque OTA/B.XML message correlation id when present. */
  readonly providerMessageId: string;
  readonly reservationId: BookingComReservationId;
  readonly hotelId: BookingComHotelId | null;
  /** Advisory provider timestamp / last change — not Talos authority. */
  readonly providerUpdatedAt: string | null;
  /** Monotonic-ish revision hint when obtainable; null if unknown. */
  readonly revisionHint: string | null;
  /** Immutable raw XML body (UTF-8). */
  readonly rawXml: string;
  readonly ruid: BookingComRuid | null;
}

export interface BookingComReservationRetrieveResult {
  readonly messages: readonly BookingComReservationMessage[];
  readonly ruid: BookingComRuid | null;
}

export interface BookingComReservationAckCommand {
  readonly kind: BookingComReservationMessageKind;
  readonly providerMessageId: string;
  readonly reservationId: BookingComReservationId;
  /** Success ack vs processing-error ack (triggers fallback email path on Booking.com). */
  readonly outcome: "success" | "error";
  /** Optional opaque response token when Feature Management requires it. */
  readonly responseToken: string | null;
}

export interface BookingComReservationAckResult {
  readonly accepted: boolean;
  readonly ruid: BookingComRuid | null;
}

export interface BookingComReservationSummaryItem {
  readonly reservationId: BookingComReservationId;
  readonly hotelId: BookingComHotelId | null;
  readonly guestName: string | null;
  readonly arrivalDate: string | null;
  readonly departureDate: string | null;
  readonly rawXml: string;
}

export interface BookingComReservationSummaryResult {
  readonly items: readonly BookingComReservationSummaryItem[];
  readonly ruid: BookingComRuid | null;
}

export interface IBookingComReservationsClient {
  /** OTA GET new reservations (`OTA_HotelResNotif`). */
  retrieveNewReservations(): Promise<BookingComReservationRetrieveResult>;
  /** OTA GET modifications/cancellations (`OTA_HotelResModifyNotif`). */
  retrieveModificationsAndCancellations(): Promise<BookingComReservationRetrieveResult>;
  /** OTA POST acknowledgement. */
  acknowledge(command: BookingComReservationAckCommand): Promise<BookingComReservationAckResult>;
  /** Recovery / pre-connection basics (`/reservationssummary`). */
  retrieveSummary(params?: {
    readonly hotelId?: BookingComHotelId;
  }): Promise<BookingComReservationSummaryResult>;
}
