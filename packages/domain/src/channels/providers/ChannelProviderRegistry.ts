import { ChannelProviderRegistrationError } from "../errors/ChannelProviderRegistrationError";
import type { ChannelSource } from "../types/ChannelSource";
import type { ChannelProviderRegistration } from "../ports/providers/ChannelProviderRegistration";
import { withDefaultProviderRegistrationPolicies } from "../ports/providers/ChannelProviderRegistration";
import { resolveAllowedFeedSemanticModes } from "../types/FeedSemanticModePolicy";
import type { IChannelProviderRegistry } from "../ports/providers/IChannelProviderRegistry";
import type { IChannelConnectionAuthProvider } from "../ports/providers/IChannelConnectionAuthProvider";
import type { IChannelWebhookProvider } from "../ports/providers/IChannelWebhookProvider";
import type { IChannelPollingProvider } from "../ports/providers/IChannelPollingProvider";
import type { IChannelReservationImportProvider } from "../ports/providers/IChannelReservationImportProvider";
import type { IChannelAvailabilityExportProvider } from "../ports/providers/IChannelAvailabilityExportProvider";
import type { IChannelRateRestrictionExportProvider } from "../ports/providers/IChannelRateRestrictionExportProvider";
import type { IChannelReservationExportProvider } from "../ports/providers/IChannelReservationExportProvider";

function assertCapabilityMatch(
  enabled: boolean,
  provider: unknown,
  label: string,
): void {
  if (enabled && provider == null) {
    throw new ChannelProviderRegistrationError(
      `${label} capability is enabled but no provider was registered`,
    );
  }
  if (!enabled && provider != null) {
    throw new ChannelProviderRegistrationError(
      `${label} capability is disabled but a provider was registered`,
    );
  }
}

export function validateChannelProviderRegistration(
  registration: ChannelProviderRegistration,
): void {
  const { capabilities: caps } = registration;

  assertCapabilityMatch(caps.connectionAuth, registration.auth, "connectionAuth");
  assertCapabilityMatch(caps.inbound.webhooks, registration.webhooks, "webhooks");
  assertCapabilityMatch(caps.inbound.polling, registration.polling, "polling");
  assertCapabilityMatch(
    caps.inbound.reservationImport,
    registration.reservationImport,
    "reservationImport",
  );
  assertCapabilityMatch(
    caps.core.availabilityExport,
    registration.availabilityExport,
    "availabilityExport",
  );
  assertCapabilityMatch(
    caps.core.rateExport || caps.core.restrictionExport,
    registration.rateRestrictionExport,
    "rateRestrictionExport",
  );
  assertCapabilityMatch(
    caps.optional.reservationExport,
    registration.reservationExport,
    "reservationExport",
  );

  if (
    caps.optional.reservationExport &&
    caps.optional.reservationExportOperations.length === 0
  ) {
    throw new ChannelProviderRegistrationError(
      "reservationExport capability is enabled but reservationExportOperations is empty",
    );
  }

  if (caps.inbound.webhooks && registration.webhooks == null) {
    throw new ChannelProviderRegistrationError(
      "webhooks capability is enabled but no webhook provider was registered",
    );
  }

  if (!caps.inbound.webhooks && registration.webhooks != null) {
    throw new ChannelProviderRegistrationError(
      "webhooks capability is disabled but a webhook provider was registered",
    );
  }

  if (caps.inbound.polling && registration.polling == null) {
    throw new ChannelProviderRegistrationError(
      "polling capability is enabled but no polling provider was registered",
    );
  }

  if (!caps.inbound.polling && registration.pollAuthPolicy != null) {
    throw new ChannelProviderRegistrationError(
      "poll auth policy is configured but polling capability is disabled",
    );
  }

  if (caps.inbound.webhooks && registration.webhookAuthPolicy == null) {
    throw new ChannelProviderRegistrationError(
      "webhook auth policy is required when webhooks capability is enabled",
    );
  }

  if (!caps.inbound.webhooks && registration.webhookAuthPolicy != null) {
    throw new ChannelProviderRegistrationError(
      "webhook auth policy is configured but webhooks capability is disabled",
    );
  }

  if (caps.inbound.polling && registration.pollAuthPolicy == null) {
    throw new ChannelProviderRegistrationError(
      "poll auth policy is required when polling capability is enabled",
    );
  }

  if (registration.allowedFeedSemanticModes != null) {
    try {
      resolveAllowedFeedSemanticModes(registration.allowedFeedSemanticModes);
    } catch (error) {
      throw new ChannelProviderRegistrationError(
        error instanceof Error ? error.message : String(error),
      );
    }
  }
}

export class ChannelProviderRegistry implements IChannelProviderRegistry {
  private readonly registrations = new Map<ChannelSource, ChannelProviderRegistration>();

  register(registration: ChannelProviderRegistration): void {
    const normalized = withDefaultProviderRegistrationPolicies(registration);
    validateChannelProviderRegistration(normalized);
    if (this.registrations.has(normalized.providerId)) {
      throw new ChannelProviderRegistrationError(
        `Provider already registered: ${normalized.providerId}`,
      );
    }
    this.registrations.set(normalized.providerId, normalized);
  }

  get(providerId: ChannelSource): ChannelProviderRegistration | null {
    return this.registrations.get(providerId) ?? null;
  }

  list(): ChannelProviderRegistration[] {
    return [...this.registrations.values()];
  }

  resolveAuth(providerId: ChannelSource): IChannelConnectionAuthProvider | null {
    const registration = this.get(providerId);
    if (!registration?.capabilities.connectionAuth) {
      return null;
    }
    return registration.auth;
  }

  resolveWebhooks(providerId: ChannelSource): IChannelWebhookProvider | null {
    const registration = this.get(providerId);
    if (!registration?.capabilities.inbound.webhooks) {
      return null;
    }
    return registration.webhooks;
  }

  resolvePolling(providerId: ChannelSource): IChannelPollingProvider | null {
    const registration = this.get(providerId);
    if (!registration?.capabilities.inbound.polling) {
      return null;
    }
    return registration.polling;
  }

  resolveReservationImport(
    providerId: ChannelSource,
  ): IChannelReservationImportProvider | null {
    const registration = this.get(providerId);
    if (!registration?.capabilities.inbound.reservationImport) {
      return null;
    }
    return registration.reservationImport;
  }

  resolveAvailabilityExport(
    providerId: ChannelSource,
  ): IChannelAvailabilityExportProvider | null {
    const registration = this.get(providerId);
    if (!registration?.capabilities.core.availabilityExport) {
      return null;
    }
    return registration.availabilityExport;
  }

  resolveRateRestrictionExport(
    providerId: ChannelSource,
  ): IChannelRateRestrictionExportProvider | null {
    const registration = this.get(providerId);
    const caps = registration?.capabilities.core;
    if (!caps || (!caps.rateExport && !caps.restrictionExport)) {
      return null;
    }
    return registration.rateRestrictionExport;
  }

  resolveReservationExport(
    providerId: ChannelSource,
  ): IChannelReservationExportProvider | null {
    const registration = this.get(providerId);
    if (!registration?.capabilities.optional.reservationExport) {
      return null;
    }
    return registration.reservationExport;
  }
}
