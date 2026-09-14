import { createProviderCapabilities } from "../types/ChannelCapabilities";
import {
  withDefaultProviderRegistrationPolicies,
  type ChannelProviderRegistration,
} from "../ports/providers/ChannelProviderRegistration";
import {
  createStubReservationImportProvider,
  FAKE_CHANNEL_PROVIDER_ID,
} from "./FakeChannelReservationImportProvider";

export function createFakeChannelProviderRegistration(): ChannelProviderRegistration {
  return withDefaultProviderRegistrationPolicies({
    providerId: FAKE_CHANNEL_PROVIDER_ID,
    capabilities: createProviderCapabilities({
      inbound: {
        webhooks: false,
        polling: false,
        reservationImport: true,
      },
      connectionAuth: false,
    }),
    status: "active",
    auth: null,
    webhooks: null,
    polling: null,
    reservationImport: createStubReservationImportProvider(),
    availabilityExport: null,
    rateRestrictionExport: null,
    reservationExport: null,
  });
}
