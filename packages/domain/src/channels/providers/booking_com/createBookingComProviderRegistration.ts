import type { IBookingComAriClient } from "./ari/IBookingComAriClient";
import type { IBookingComReservationsClient } from "./reservations/IBookingComReservationsClient";
import { BOOKING_COM_PROVIDER_CAPABILITIES } from "../../types/ChannelCapabilities";
import {
  withDefaultProviderRegistrationPolicies,
  type ChannelProviderRegistration,
} from "../../ports/providers/ChannelProviderRegistration";
import type { IChannelAvailabilityExportProvider } from "../../ports/providers/IChannelAvailabilityExportProvider";
import type { IChannelPollingProvider } from "../../ports/providers/IChannelPollingProvider";
import type { IChannelRateRestrictionExportProvider } from "../../ports/providers/IChannelRateRestrictionExportProvider";
import type { IChannelReservationImportProvider } from "../../ports/providers/IChannelReservationImportProvider";
import { BookingComPollingProvider } from "./BookingComPollingProvider";
import { BookingComReservationImportProvider } from "./BookingComReservationImportProvider";
import { BookingComReservationsClientNotConfigured } from "./http/BookingComReservationsClientNotConfigured";
import { BookingComAriClientNotConfigured } from "./ari/BookingComAriClientNotConfigured";
import { BookingComAvailabilityExportProvider } from "./BookingComAvailabilityExportProvider";
import { BookingComRateRestrictionExportProvider } from "./BookingComRateRestrictionExportProvider";
import { ValidationError } from "../../../shared/errors/DomainError";

export interface CreateBookingComProviderRegistrationOptions {
  readonly reservationsClient?: IBookingComReservationsClient;
  readonly ariClient?: IBookingComAriClient;
  readonly polling?: IChannelPollingProvider;
  readonly reservationImport?: IChannelReservationImportProvider;
  readonly availabilityExport?: IChannelAvailabilityExportProvider;
  readonly rateRestrictionExport?: IChannelRateRestrictionExportProvider;
}

/**
 * Booking.com Connectivity provider registration (CM-4c-1/2/3).
 * Defaults use fail-closed HTTP clients (no live Booking.com calls).
 * Durable ARI scheduling is application-owned (RequestBookingComAriPropagationUseCase).
 */
export function createBookingComProviderRegistration(
  options: CreateBookingComProviderRegistrationOptions = {},
): ChannelProviderRegistration {
  const reservationsClient =
    options.reservationsClient ?? new BookingComReservationsClientNotConfigured();
  const ariClient = options.ariClient ?? new BookingComAriClientNotConfigured();

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
      options.availabilityExport ??
      new BookingComAvailabilityExportProvider({
        ariClient,
        resolveHotelAndRoom: () => {
          throw new ValidationError(
            "Booking.com availability export mapping must be resolved by the ARI propagation use case",
          );
        },
      }),
    rateRestrictionExport:
      options.rateRestrictionExport ??
      new BookingComRateRestrictionExportProvider({
        ariClient,
        resolveHotelRoomRate: () => {
          throw new ValidationError(
            "Booking.com rate/restriction export mapping must be resolved by the ARI propagation use case",
          );
        },
      }),
    reservationExport: null,
    allowedFeedSemanticModes: null,
  });
}
