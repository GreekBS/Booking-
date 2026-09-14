export interface ChannelCoreCapabilities {
  availabilityExport: boolean;
  rateExport: boolean;
  restrictionExport: boolean;
}

export interface ChannelInboundCapabilities {
  webhooks: boolean;
  polling: boolean;
  reservationImport: boolean;
}

export type ReservationExportOperation = "create" | "modify" | "cancel";

export interface ChannelOptionalCapabilities {
  reservationExport: boolean;
  reservationExportOperations: ReservationExportOperation[];
}

export interface ChannelProviderCapabilities {
  core: ChannelCoreCapabilities;
  inbound: ChannelInboundCapabilities;
  optional: ChannelOptionalCapabilities;
  connectionAuth: boolean;
}

const DEFAULT_CORE: ChannelCoreCapabilities = {
  availabilityExport: false,
  rateExport: false,
  restrictionExport: false,
};

const DEFAULT_INBOUND: ChannelInboundCapabilities = {
  webhooks: false,
  polling: false,
  reservationImport: false,
};

const DEFAULT_OPTIONAL: ChannelOptionalCapabilities = {
  reservationExport: false,
  reservationExportOperations: [],
};

export function createProviderCapabilities(
  partial: Partial<{
    core: Partial<ChannelCoreCapabilities>;
    inbound: Partial<ChannelInboundCapabilities>;
    optional: Partial<ChannelOptionalCapabilities>;
    connectionAuth: boolean;
  }> = {},
): ChannelProviderCapabilities {
  return {
    core: { ...DEFAULT_CORE, ...partial.core },
    inbound: { ...DEFAULT_INBOUND, ...partial.inbound },
    optional: { ...DEFAULT_OPTIONAL, ...partial.optional },
    connectionAuth: partial.connectionAuth ?? false,
  };
}

export const API_CHANNEL_CORE_CAPABILITIES: ChannelCoreCapabilities = {
  availabilityExport: true,
  rateExport: true,
  restrictionExport: true,
};

export const API_CHANNEL_INBOUND_CAPABILITIES: ChannelInboundCapabilities = {
  webhooks: true,
  polling: true,
  reservationImport: true,
};

/** Provider-1 MVP: polling-only inbound evidence adapter (ADR-023 / P1-S1). */
export const ICAL_PROVIDER_CAPABILITIES: ChannelProviderCapabilities = {
  core: {
    availabilityExport: false,
    rateExport: false,
    restrictionExport: false,
  },
  inbound: {
    webhooks: false,
    polling: true,
    reservationImport: false,
  },
  optional: {
    reservationExport: false,
    reservationExportOperations: [],
  },
  connectionAuth: false,
};
