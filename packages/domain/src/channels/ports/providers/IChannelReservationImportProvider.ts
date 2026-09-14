import type { ChannelProviderMessage } from "../../types/ChannelProviderMessage";
import type { ChannelReservationImportMapping } from "../../types/ChannelReservationImportMapping";

export interface ChannelReservationImportContext {
  tenantId: string;
  connectionId: string;
  propertyId: string;
  unitId: string;
}

export interface IChannelReservationImportProvider {
  mapMessage(
    message: ChannelProviderMessage,
    context: ChannelReservationImportContext,
  ): Promise<ChannelReservationImportMapping>;
}
