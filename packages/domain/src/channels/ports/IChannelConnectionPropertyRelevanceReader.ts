import type { ChannelConnection } from "../domain/ChannelConnection";

/**
 * Batched property-relevance queries for ChannelConnection (Active Property 1.2).
 * Implementations must avoid N+1 (join/batch over listing + product mappings).
 */
export interface IChannelConnectionPropertyRelevanceReader {
  /**
   * Connections relevant to propertyId under the canonical relevance rule.
   */
  listRelevantToProperty(
    tenantId: string,
    propertyId: string,
  ): Promise<ChannelConnection[]>;

  /**
   * Distinct property ids that authorize a connection (mapped, else workspace).
   */
  resolveRelevantPropertyIds(
    tenantId: string,
    connectionId: string,
  ): Promise<string[]>;
}
