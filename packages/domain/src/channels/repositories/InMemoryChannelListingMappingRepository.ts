import { ConflictError } from "../../shared/errors/DomainError";
import { ChannelListingMapping } from "../domain/ChannelListingMapping";
import type { ChannelListingMappingProps } from "../domain/ChannelListingMapping";
import type { IChannelListingMappingRepository } from "../ports/IChannelListingMappingRepository";

function cloneProps(props: ChannelListingMappingProps): ChannelListingMappingProps {
  return {
    ...props,
    createdAt: new Date(props.createdAt),
    updatedAt: new Date(props.updatedAt),
  };
}

function externalKey(
  connectionId: string,
  externalListingId: string,
  externalUnitId: string | null,
): string {
  return `${connectionId}:${externalListingId}:${externalUnitId ?? ""}`;
}

export class InMemoryChannelListingMappingRepository implements IChannelListingMappingRepository {
  private readonly store = new Map<string, ChannelListingMappingProps>();

  async save(mapping: ChannelListingMapping): Promise<void> {
    const props = cloneProps(mapping.toProps());
    const key = externalKey(props.connectionId, props.externalListingId, props.externalUnitId);
    for (const [id, existing] of this.store.entries()) {
      if (id === props.id) {
        continue;
      }
      if (existing.tenantId !== props.tenantId) {
        continue;
      }
      if (
        externalKey(existing.connectionId, existing.externalListingId, existing.externalUnitId) ===
        key
      ) {
        throw new ConflictError("External listing mapping already exists for this connection");
      }
    }
    this.store.set(props.id, props);
  }

  async findById(tenantId: string, mappingId: string): Promise<ChannelListingMapping | null> {
    const props = this.store.get(mappingId);
    if (!props || props.tenantId !== tenantId) {
      return null;
    }
    return ChannelListingMapping.reconstitute(cloneProps(props));
  }

  async listByConnection(
    tenantId: string,
    connectionId: string,
  ): Promise<ChannelListingMapping[]> {
    return [...this.store.values()]
      .filter((props) => props.tenantId === tenantId && props.connectionId === connectionId)
      .map((props) => ChannelListingMapping.reconstitute(cloneProps(props)));
  }

  async findByExternalListing(
    tenantId: string,
    connectionId: string,
    externalListingId: string,
    externalUnitId: string | null = null,
  ): Promise<ChannelListingMapping | null> {
    const match = [...this.store.values()].find(
      (props) =>
        props.tenantId === tenantId &&
        props.connectionId === connectionId &&
        props.externalListingId === externalListingId &&
        props.externalUnitId === externalUnitId,
    );
    return match ? ChannelListingMapping.reconstitute(cloneProps(match)) : null;
  }

  clear(): void {
    this.store.clear();
  }
}
