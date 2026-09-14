import type { ChannelListingMapping } from "../domain/ChannelListingMapping";

export interface IChannelListingMappingRepository {
  save(mapping: ChannelListingMapping): Promise<void>;
  findById(tenantId: string, mappingId: string): Promise<ChannelListingMapping | null>;
  listByConnection(tenantId: string, connectionId: string): Promise<ChannelListingMapping[]>;
  findByExternalListing(
    tenantId: string,
    connectionId: string,
    externalListingId: string,
    externalUnitId?: string | null,
  ): Promise<ChannelListingMapping | null>;
}
