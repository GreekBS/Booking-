import type { ExportResult, RateDelta, RestrictionDelta } from "../../types/ChannelExportDeltas";

export interface IChannelRateRestrictionExportProvider {
  publishRates(delta: RateDelta): Promise<ExportResult>;
  publishRestrictions(delta: RestrictionDelta): Promise<ExportResult>;
}
