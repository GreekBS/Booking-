import { createProviderCapabilities } from "../types/ChannelCapabilities";
import {
  withDefaultProviderRegistrationPolicies,
  type ChannelProviderRegistration,
} from "../ports/providers/ChannelProviderRegistration";
import type { ChannelSource } from "../types/ChannelSource";
import { TestChannelPollingProvider } from "./TestChannelPollingProvider";
import { TestChannelWebhookProvider } from "./TestChannelWebhookProvider";

export const TEST_CHANNEL_TRANSPORT_PROVIDER_ID = "manual" satisfies ChannelSource;

export function createTestChannelTransportProviderRegistration(
  overrides: Partial<{
    webhookProvider: TestChannelWebhookProvider;
    pollingProvider: TestChannelPollingProvider;
    webhookAuthPolicy: ChannelProviderRegistration["webhookAuthPolicy"];
    pollAuthPolicy: ChannelProviderRegistration["pollAuthPolicy"];
    maintenanceEventPolicy: ChannelProviderRegistration["maintenanceEventPolicy"];
  }> = {},
): ChannelProviderRegistration {
  return withDefaultProviderRegistrationPolicies({
    providerId: TEST_CHANNEL_TRANSPORT_PROVIDER_ID,
    capabilities: createProviderCapabilities({
      inbound: {
        webhooks: true,
        polling: true,
        reservationImport: false,
      },
      connectionAuth: false,
    }),
    status: "active",
    auth: null,
    webhooks: overrides.webhookProvider ?? new TestChannelWebhookProvider(),
    polling: overrides.pollingProvider ?? new TestChannelPollingProvider(),
    reservationImport: null,
    availabilityExport: null,
    rateRestrictionExport: null,
    reservationExport: null,
    webhookAuthPolicy: overrides.webhookAuthPolicy ?? {
      requiresVerification: true,
      requiresWebhookVerificationRef: true,
      requiresCredentialRef: false,
    },
    pollAuthPolicy: overrides.pollAuthPolicy ?? {
      requiresCredentialRef: true,
    },
    maintenanceEventPolicy: overrides.maintenanceEventPolicy ?? {
      connectivityTestIngress: "ack_without_persist",
    },
  });
}
