import type { ChannelSource } from "../../types/ChannelSource";
import type { ChannelProviderRegistration } from "./ChannelProviderRegistration";
import type { IChannelConnectionAuthProvider } from "./IChannelConnectionAuthProvider";
import type { IChannelWebhookProvider } from "./IChannelWebhookProvider";
import type { IChannelPollingProvider } from "./IChannelPollingProvider";
import type { IChannelReservationImportProvider } from "./IChannelReservationImportProvider";
import type { IChannelAvailabilityExportProvider } from "./IChannelAvailabilityExportProvider";
import type { IChannelRateRestrictionExportProvider } from "./IChannelRateRestrictionExportProvider";
import type { IChannelReservationExportProvider } from "./IChannelReservationExportProvider";

export interface IChannelProviderRegistry {
  register(registration: ChannelProviderRegistration): void;
  get(providerId: ChannelSource): ChannelProviderRegistration | null;
  list(): ChannelProviderRegistration[];
  resolveAuth(providerId: ChannelSource): IChannelConnectionAuthProvider | null;
  resolveWebhooks(providerId: ChannelSource): IChannelWebhookProvider | null;
  resolvePolling(providerId: ChannelSource): IChannelPollingProvider | null;
  resolveReservationImport(providerId: ChannelSource): IChannelReservationImportProvider | null;
  resolveAvailabilityExport(providerId: ChannelSource): IChannelAvailabilityExportProvider | null;
  resolveRateRestrictionExport(
    providerId: ChannelSource,
  ): IChannelRateRestrictionExportProvider | null;
  resolveReservationExport(providerId: ChannelSource): IChannelReservationExportProvider | null;
}
