import { BOOKING_COM_PROVIDER_CAPABILITIES } from "../../types/ChannelCapabilities";
import {
  withDefaultProviderRegistrationPolicies,
  type ChannelProviderRegistration,
} from "../../ports/providers/ChannelProviderRegistration";
import type { IChannelAvailabilityExportProvider } from "../../ports/providers/IChannelAvailabilityExportProvider";
import type { IChannelPollingProvider } from "../../ports/providers/IChannelPollingProvider";
import type { IChannelRateRestrictionExportProvider } from "../../ports/providers/IChannelRateRestrictionExportProvider";
import type { IChannelReservationImportProvider } from "../../ports/providers/IChannelReservationImportProvider";
import type { IBookingComReservationsClient } from "./reservations/IBookingComReservationsClient";
import { BookingComPollingProvider } from "./BookingComPollingProvider";
import { BookingComReservationImportProvider } from "./BookingComReservationImportProvider";
import { BookingComReservationsClientNotConfigured } from "./http/BookingComReservationsClientNotConfigured";
import { BookingComNotReadyAvailabilityExportProvider } from "./stubs/BookingComNotReadyAvailabilityExportProvider";
import { BookingComNotReadyRateRestrictionExportProvider } from "./stubs/BookingComNotReadyRateRestrictionExportProvider";

export interface CreateBookingComProviderRegistrationOptions {
  readonly reservationsClient?: IBookingComReservationsClient;
  readonly polling?: IChannelPollingProvider;
  readonly reservationImport?: IChannelReservationImportProvider;
  readonly availabilityExport?: IChannelAvailabilityExportProvider;
  readonly rateRestrictionExport?: IChannelRateRestrictionExportProvider;
}

/**
 * Booking.com Connectivity provider registration (CM-4c-1/2).
 * Reservation poll + import are live against injected/fake clients.
 * Default HTTP client is not configured (no live Booking.com calls).
 * ARI remains fail-closed until CM-4c-3.
 */
export function createBookingComProviderRegistration(
  options: CreateBookingComProviderRegistrationOptions = {},
): ChannelProviderRegistration {
  const reservationsClient =
    options.reservationsClient ?? new BookingComReservationsClientNotConfigured();

  return withDefaultProviderRegistrationPolicies({
    providerId: "booking_com",
    capabilities: BOOKING_COM_PROVIDER_CAPABILITIES,
    status: "active",
    auth: null,
    webhooks: null,
    polling:
      options.polling ??
      new BookingComPollingProvider({ reservationsClient }),
    reservationImport:
      options.reservationImport ?? new BookingComReservationImportProvider(),
    availabilityExport:
      options.availabilityExport ?? new BookingComNotReadyAvailabilityExportProvider(),
    rateRestrictionExport:
      options.rateRestrictionExport ??
      new BookingComNotReadyRateRestrictionExportProvider(),
    reservationExport: null,
    allowedFeedSemanticModes: null,
  });
}
