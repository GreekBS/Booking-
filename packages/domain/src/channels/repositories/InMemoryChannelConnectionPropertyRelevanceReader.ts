import type { ChannelConnection } from "../domain/ChannelConnection";
import type { IChannelConnectionPropertyRelevanceReader } from "../ports/IChannelConnectionPropertyRelevanceReader";
import type { IChannelConnectionRepository } from "../ports/IChannelConnectionRepository";
import {
  isConnectionRelevantToProperty,
  resolveConnectionRelevantPropertyIds,
} from "../application/channelConnectionPropertyRelevance";

export interface InMemoryPropertyBearingMapping {
  connectionId: string;
  propertyId: string | null;
  status: string;
}

/**
 * In-memory relevance reader for domain tests (Active Property 1.2).
 */
export class InMemoryChannelConnectionPropertyRelevanceReader
  implements IChannelConnectionPropertyRelevanceReader
{
  private listingMappings: InMemoryPropertyBearingMapping[] = [];
  private productMappings: InMemoryPropertyBearingMapping[] = [];

  constructor(private readonly connections: IChannelConnectionRepository) {}

  setListingMappings(mappings: InMemoryPropertyBearingMapping[]): void {
    this.listingMappings = [...mappings];
  }

  setProductMappings(mappings: InMemoryPropertyBearingMapping[]): void {
    this.productMappings = [...mappings];
  }

  async listRelevantToProperty(
    tenantId: string,
    propertyId: string,
  ): Promise<ChannelConnection[]> {
    const all = await this.connections.listByTenant(tenantId);
    return all.filter((connection) =>
      isConnectionRelevantToProperty({
        propertyId,
        workspacePropertyId: connection.workspacePropertyId,
        listingMappings: this.listingMappings.filter(
          (m) => m.connectionId === connection.id,
        ),
        productMappings: this.productMappings.filter(
          (m) => m.connectionId === connection.id,
        ),
      }),
    );
  }

  async resolveRelevantPropertyIds(
    tenantId: string,
    connectionId: string,
  ): Promise<string[]> {
    const connection = await this.connections.findById(tenantId, connectionId);
    if (!connection) {
      return [];
    }
    return resolveConnectionRelevantPropertyIds({
      workspacePropertyId: connection.workspacePropertyId,
      listingMappings: this.listingMappings.filter(
        (m) => m.connectionId === connectionId,
      ),
      productMappings: this.productMappings.filter(
        (m) => m.connectionId === connectionId,
      ),
    });
  }
}
