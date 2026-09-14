import type { ChannelSource } from "../../types/ChannelSource";
import type { ChannelProviderCapabilities } from "../../types/ChannelCapabilities";
import type { ChannelProviderRegistrationStatus } from "../../types/ChannelSyncEnums";
import type {
  ChannelMaintenanceEventPolicy,
  ChannelPollAuthPolicy,
  ChannelWebhookAuthPolicy,
} from "../../types/ChannelProviderAuthPolicy";
import { DEFAULT_MAINTENANCE_EVENT_POLICY } from "../../types/ChannelProviderAuthPolicy";
import type { FeedSemanticMode } from "../../types/FeedSemanticMode";
import type { IChannelConnectionAuthProvider } from "./IChannelConnectionAuthProvider";
import type { IChannelWebhookProvider } from "./IChannelWebhookProvider";
import type { IChannelPollingProvider } from "./IChannelPollingProvider";
import type { IChannelReservationImportProvider } from "./IChannelReservationImportProvider";
import type { IChannelAvailabilityExportProvider } from "./IChannelAvailabilityExportProvider";
import type { IChannelRateRestrictionExportProvider } from "./IChannelRateRestrictionExportProvider";
import type { IChannelReservationExportProvider } from "./IChannelReservationExportProvider";

export interface ChannelProviderRegistration {
  providerId: ChannelSource;
  capabilities: ChannelProviderCapabilities;
  status: ChannelProviderRegistrationStatus;
  auth: IChannelConnectionAuthProvider | null;
  webhooks: IChannelWebhookProvider | null;
  polling: IChannelPollingProvider | null;
  reservationImport: IChannelReservationImportProvider | null;
  availabilityExport: IChannelAvailabilityExportProvider | null;
  rateRestrictionExport: IChannelRateRestrictionExportProvider | null;
  reservationExport: IChannelReservationExportProvider | null;
  webhookAuthPolicy: ChannelWebhookAuthPolicy | null;
  pollAuthPolicy: ChannelPollAuthPolicy | null;
  maintenanceEventPolicy: ChannelMaintenanceEventPolicy;
  /**
   * Explicit allow-list of feed semantic modes.
   * null/undefined → fail-closed default (mixed_or_unknown_feed only) via resolveAllowedFeedSemanticModes.
   */
  allowedFeedSemanticModes?: readonly FeedSemanticMode[] | null;
}

export function withDefaultProviderRegistrationPolicies(
  registration: Omit<
    ChannelProviderRegistration,
    "webhookAuthPolicy" | "pollAuthPolicy" | "maintenanceEventPolicy"
  > &
    Partial<
      Pick<
        ChannelProviderRegistration,
        | "webhookAuthPolicy"
        | "pollAuthPolicy"
        | "maintenanceEventPolicy"
        | "allowedFeedSemanticModes"
      >
    >,
): ChannelProviderRegistration {
  return {
    ...registration,
    allowedFeedSemanticModes: registration.allowedFeedSemanticModes ?? null,
    webhookAuthPolicy:
      registration.webhookAuthPolicy ??
      (registration.webhooks
        ? {
            requiresVerification: true,
            requiresWebhookVerificationRef: true,
            requiresCredentialRef: false,
          }
        : null),
    pollAuthPolicy:
      registration.pollAuthPolicy ??
      (registration.polling
        ? {
            requiresCredentialRef: true,
          }
        : null),
    maintenanceEventPolicy:
      registration.maintenanceEventPolicy ?? DEFAULT_MAINTENANCE_EVENT_POLICY,
  };
}
