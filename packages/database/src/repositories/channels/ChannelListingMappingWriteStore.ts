import {
  NotFoundError,
  type ChannelListingMapping,
  type IChannelListingMappingWriteStore,
} from "@hcp/domain";
import {
  prisma,
  setTenantContext,
  type PrismaTransactionClient,
} from "../../client";
import { PrismaChannelListingMappingRepository } from "./ChannelListingMappingRepository";

type DbClient = typeof prisma | PrismaTransactionClient;

/**
 * P1-S6a — phantom-safe mapping writes.
 * Always locks channel_connections FOR UPDATE before mutating ChannelListingMapping.
 */
export class PrismaChannelListingMappingWriteStore implements IChannelListingMappingWriteStore {
  constructor(private readonly client: DbClient = prisma) {}

  async persist(mapping: ChannelListingMapping): Promise<void> {
    const props = mapping.toProps();

    if ("$transaction" in this.client) {
      await this.client.$transaction(async (tx) => {
        await setTenantContext(tx, props.tenantId);
        await this.lockConnection(tx, props.tenantId, props.connectionId);
        const repo = new PrismaChannelListingMappingRepository(tx);
        await repo.saveAssumingConnectionLocked(tx, mapping);
      });
      return;
    }

    await setTenantContext(this.client, props.tenantId);
    await this.lockConnection(this.client, props.tenantId, props.connectionId);
    const repo = new PrismaChannelListingMappingRepository(this.client);
    await repo.saveAssumingConnectionLocked(this.client, mapping);
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
