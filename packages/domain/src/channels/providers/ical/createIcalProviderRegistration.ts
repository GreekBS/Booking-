import { ICAL_PROVIDER_CAPABILITIES } from "../../types/ChannelCapabilities";
import {
  withDefaultProviderRegistrationPolicies,
  type ChannelProviderRegistration,
} from "../../ports/providers/ChannelProviderRegistration";
import { IcalPollingProvider } from "./IcalPollingProvider";
import type { IIcalFeedFetcher } from "./ports/IIcalFeedFetcher";

export interface CreateIcalProviderRegistrationOptions {
  readonly feedFetcher: IIcalFeedFetcher;
}

/**
 * Provider-1 registration factory.
 * `status: "active"` means valid/discoverable only — not operational readiness.
 *
 * Semantic allow-list is inventory-oriented: availability_block_feed (operational)
 * and mixed_or_unknown_feed (draft default). reservation_feed is excluded while
 * mayEmitReservationCreate remains false.
 */
export function createIcalProviderRegistration(
  options: CreateIcalProviderRegistrationOptions,
): ChannelProviderRegistration {
  return withDefaultProviderRegistrationPolicies({
    providerId: "ical",
    capabilities: ICAL_PROVIDER_CAPABILITIES,
    status: "active",
    auth: null,
    webhooks: null,
    polling: new IcalPollingProvider(options.feedFetcher),
    reservationImport: null,
    availabilityExport: null,
    rateRestrictionExport: null,
    reservationExport: null,
    allowedFeedSemanticModes: [
      "availability_block_feed",
      "mixed_or_unknown_feed",
    ],
  });
}
