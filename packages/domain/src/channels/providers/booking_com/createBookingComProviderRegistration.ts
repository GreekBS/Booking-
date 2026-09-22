import { BOOKING_COM_PROVIDER_CAPABILITIES } from "../../types/ChannelCapabilities";
import {
  withDefaultProviderRegistrationPolicies,
  type ChannelProviderRegistration,
} from "../../ports/providers/ChannelProviderRegistration";
import type { IChannelAvailabilityExportProvider } from "../../ports/providers/IChannelAvailabilityExportProvider";
import type { IChannelPollingProvider } from "../../ports/providers/IChannelPollingProvider";
import type { IChannelRateRestrictionExportProvider } from "../../ports/providers/IChannelRateRestrictionExportProvider";
import type { IChannelReservationImportProvider } from "../../ports/providers/IChannelReservationImportProvider";
import { BookingComNotReadyAvailabilityExportProvider } from "./stubs/BookingComNotReadyAvailabilityExportProvider";
import { BookingComNotReadyPollingProvider } from "./stubs/BookingComNotReadyPollingProvider";
import { BookingComNotReadyRateRestrictionExportProvider } from "./stubs/BookingComNotReadyRateRestrictionExportProvider";
import { BookingComNotReadyReservationImportProvider } from "./stubs/BookingComNotReadyReservationImportProvider";

export interface CreateBookingComProviderRegistrationOptions {
  readonly polling?: IChannelPollingProvider;
  readonly reservationImport?: IChannelReservationImportProvider;
  readonly availabilityExport?: IChannelAvailabilityExportProvider;
  readonly rateRestrictionExport?: IChannelRateRestrictionExportProvider;
}

/**
 * Booking.com Connectivity provider registration (CM-4c-1).
 * Production enablement remains CHANNELS_ENABLED_PROVIDERS allow-list only.
 * Default ports fail closed until CM-4c-2 (reservations) / CM-4c-3 (ARI).
 */
export function createBookingComProviderRegistration(
  options: CreateBookingComProviderRegistrationOptions = {},
): ChannelProviderRegistration {
  return withDefaultProviderRegistrationPolicies({
    providerId: "booking_com",
    capabilities: BOOKING_COM_PROVIDER_CAPABILITIES,
    status: "active",
    auth: null,
    webhooks: null,
    polling: options.polling ?? new BookingComNotReadyPollingProvider(),
    reservationImport:
      options.reservationImport ?? new BookingComNotReadyReservationImportProvider(),
    availabilityExport:
      options.availabilityExport ?? new BookingComNotReadyAvailabilityExportProvider(),
    rateRestrictionExport:
      options.rateRestrictionExport ??
      new BookingComNotReadyRateRestrictionExportProvider(),
    reservationExport: null,
    allowedFeedSemanticModes: null,
  });
}
