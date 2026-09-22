import { DomainError } from "../../../../shared/errors/DomainError";
import type {
  BookingComReservationAckCommand,
  BookingComReservationAckResult,
  BookingComReservationRetrieveResult,
  BookingComReservationSummaryResult,
  IBookingComReservationsClient,
} from "../reservations/IBookingComReservationsClient";
import type { BookingComHotelId } from "../ids/BookingComIds";

export class BookingComReservationsClientNotConfiguredError extends DomainError {
  static readonly CODE = "BOOKING_COM_RESERVATIONS_CLIENT_NOT_CONFIGURED" as const;

  constructor() {
    super(
      "Booking.com reservations client is not configured (no live HTTP in CM-4c-2 defaults)",
      BookingComReservationsClientNotConfiguredError.CODE,
    );
  }
}

/** Production default — fail closed; never opens sockets. */
export class BookingComReservationsClientNotConfigured
  implements IBookingComReservationsClient
{
  async retrieveNewReservations(): Promise<BookingComReservationRetrieveResult> {
    throw new BookingComReservationsClientNotConfiguredError();
  }

  async retrieveModificationsAndCancellations(): Promise<BookingComReservationRetrieveResult> {
    throw new BookingComReservationsClientNotConfiguredError();
  }

  async acknowledge(
    command: BookingComReservationAckCommand,
  ): Promise<BookingComReservationAckResult> {
    void command;
    throw new BookingComReservationsClientNotConfiguredError();
  }

  async retrieveSummary(params?: {
    readonly hotelId?: BookingComHotelId;
  }): Promise<BookingComReservationSummaryResult> {
    void params;
    throw new BookingComReservationsClientNotConfiguredError();
  }
}
