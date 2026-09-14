import type { ExportResult } from "../../types/ChannelExportDeltas";
import type { ReservationExportOperation } from "../../types/ChannelCapabilities";

export interface ChannelReservationExportParams {
  tenantId: string;
  bookingId: string;
  connectionId: string;
  operation: ReservationExportOperation;
}

export interface IChannelReservationExportProvider {
  exportChange(params: ChannelReservationExportParams): Promise<ExportResult>;
}
