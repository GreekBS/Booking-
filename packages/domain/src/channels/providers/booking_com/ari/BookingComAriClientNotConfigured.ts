import { DomainError } from "../../../../shared/errors/DomainError";
import type {
  BookingComAriPushRequest,
  BookingComAriPushResult,
  IBookingComAriClient,
} from "./IBookingComAriClient";

export class BookingComAriClientNotConfiguredError extends DomainError {
  static readonly CODE = "BOOKING_COM_ARI_CLIENT_NOT_CONFIGURED" as const;

  constructor() {
    super(
      "Booking.com ARI client is not configured (no live HTTP in CM-4c-3 defaults)",
      BookingComAriClientNotConfiguredError.CODE,
    );
  }
}

/** Production default — fail closed; never opens sockets. */
export class BookingComAriClientNotConfigured implements IBookingComAriClient {
  async pushAvailabilityRatesRestrictions(
    request: BookingComAriPushRequest,
  ): Promise<BookingComAriPushResult> {
    void request;
    throw new BookingComAriClientNotConfiguredError();
  }
}
