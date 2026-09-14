import type { AvailabilityDelta, ExportResult } from "../../types/ChannelExportDeltas";

export interface IChannelAvailabilityExportProvider {
  publishAvailability(delta: AvailabilityDelta): Promise<ExportResult>;
}
