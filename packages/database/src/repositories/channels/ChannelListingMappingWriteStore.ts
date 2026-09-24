import {
  NotFoundError,
  type ChannelListingMapping,
  type IChannelListingMappingWriteStore,
} from "@hcp/domain";
import {
  withTenantTransaction,
  type PrismaTransactionClient,
} from "../../client";
import { PrismaChannelListingMappingRepository } from "./ChannelListingMappingRepository";

/**
 * P1-S6a — phantom-safe mapping writes.
 * Always locks channel_connections FOR UPDATE before mutating ChannelListingMapping.
 */
export class PrismaChannelListingMappingWriteStore implements IChannelListingMappingWriteStore {
  async persist(mapping: ChannelListingMapping): Promise<void> {
    const props = mapping.toProps();

    await withTenantTransaction(props.tenantId, async (tx) => {
      await this.lockConnection(tx, props.tenantId, props.connectionId);
      const repo = new PrismaChannelListingMappingRepository(tx);
      await repo.saveAssumingConnectionLocked(tx, mapping);
    });
  }

  private async lockConnection(
    tx: PrismaTransactionClient,
    tenantId: string,
    connectionId: string,
  ): Promise<void> {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id"
      FROM "channel_connections"
      WHERE "tenant_id" = ${tenantId}::uuid
        AND "id" = ${connectionId}
      FOR UPDATE
    `;
    if (!rows[0]) {
      throw new NotFoundError("ChannelConnection", connectionId);
    }
  }
}
