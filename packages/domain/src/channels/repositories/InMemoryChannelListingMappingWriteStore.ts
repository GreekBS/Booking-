import type { ChannelListingMapping } from "../domain/ChannelListingMapping";
import type { IChannelListingMappingRepository } from "../ports/IChannelListingMappingRepository";
import type { IChannelListingMappingWriteStore } from "../ports/IChannelListingMappingWriteStore";

/**
 * In-memory write store: serializes mutations per connectionId via a promise chain
 * to approximate FOR UPDATE connection serialization for tests.
 */
export class InMemoryChannelListingMappingWriteStore implements IChannelListingMappingWriteStore {
  private readonly locks = new Map<string, Promise<void>>();

  constructor(private readonly repository: IChannelListingMappingRepository) {}

  async persist(mapping: ChannelListingMapping): Promise<void> {
    const key = `${mapping.tenantId}\0${mapping.connectionId}`;
    const previous = this.locks.get(key) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.locks.set(
      key,
      previous.then(() => gate),
    );
    await previous;
    try {
      await this.repository.save(mapping);
    } finally {
      release();
      if (this.locks.get(key) === gate) {
        this.locks.delete(key);
      }
    }
  }
}
