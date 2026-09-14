import type { ChannelListingMapping } from "../domain/ChannelListingMapping";

/**
 * Phantom-safe mapping persistence: ALWAYS locks channel_connections FOR UPDATE
 * before mutating ChannelListingMapping (READ COMMITTED safe).
 */
export interface IChannelListingMappingWriteStore {
  persist(mapping: ChannelListingMapping): Promise<void>;
}
