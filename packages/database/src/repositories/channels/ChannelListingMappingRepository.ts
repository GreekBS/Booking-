import type { ChannelListingMapping, IChannelListingMappingRepository, SyncDirection } from "@hcp/domain";
import { ChannelListingMapping as ChannelListingMappingAggregate, NotFoundError } from "@hcp/domain";
import type { ChannelListingMappingStatus } from "@hcp/domain";
import type {
  ChannelListingMapping as PrismaChannelListingMapping,
  ChannelListingMappingStatus as PrismaChannelListingMappingStatus,
  ChannelSyncDirection as PrismaChannelSyncDirection,
  PrismaClient,
} from "@prisma/client";
import {
  prisma,
  withTenantTransaction,
  type PrismaTransactionClient,
} from "../../client";

type MappingDatabaseClient = PrismaClient | PrismaTransactionClient;

function toDomain(record: PrismaChannelListingMapping): ChannelListingMapping {
  return ChannelListingMappingAggregate.reconstitute({
    id: record.id,
    tenantId: record.tenantId,
    connectionId: record.connectionId,
    externalListingId: record.externalListingId,
    externalUnitId: record.externalUnitId,
    propertyId: record.propertyId,
    unitId: record.unitId,
    syncDirection: record.syncDirection as SyncDirection,
    status: record.status as ChannelListingMappingStatus,
    mappingVersion: record.mappingVersion,
    lastError: record.lastError,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  });
}

/**
 * Mapping repository.
 * `save` always locks channel_connections FOR UPDATE first (P1-S6a phantom-safe).
 * Use `saveAssumingConnectionLocked` only inside a TX that already holds the connection row.
 */
export class PrismaChannelListingMappingRepository implements IChannelListingMappingRepository {
  constructor(private readonly client: MappingDatabaseClient = prisma) {}

  async save(mapping: ChannelListingMappingAggregate): Promise<void> {
    const props = mapping.toProps();
    await withTenantTransaction(props.tenantId, async (tx) => {
      await this.lockConnection(tx, props.tenantId, props.connectionId);
      await this.upsert(tx, mapping);
    });
  }

  /** Caller must already hold channel_connections FOR UPDATE in `tx`. */
  async saveAssumingConnectionLocked(
    tx: PrismaTransactionClient,
    mapping: ChannelListingMappingAggregate,
  ): Promise<void> {
    await this.upsert(tx, mapping);
  }

  async findById(tenantId: string, mappingId: string): Promise<ChannelListingMapping | null> {
    return withTenantTransaction(tenantId, async (tx) => {
      const record = await tx.channelListingMapping.findUnique({
        where: { tenantId_id: { tenantId, id: mappingId } },
      });
      return record ? toDomain(record) : null;
    });
  }

  async listByConnection(tenantId: string, connectionId: string): Promise<ChannelListingMapping[]> {
    return withTenantTransaction(tenantId, async (tx) => {
      const records = await tx.channelListingMapping.findMany({
        where: { tenantId, connectionId },
        orderBy: { updatedAt: "desc" },
      });
      return records.map(toDomain);
    });
  }

  async findByExternalListing(
    tenantId: string,
    connectionId: string,
    externalListingId: string,
    externalUnitId?: string | null,
  ): Promise<ChannelListingMapping | null> {
    return withTenantTransaction(tenantId, async (tx) => {
      const unitId = externalUnitId ?? null;
      const record = await tx.channelListingMapping.findFirst({
        where: {
          tenantId,
          connectionId,
          externalListingId,
          externalUnitId: unitId,
        },
      });
      return record ? toDomain(record) : null;
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

  private async upsert(
    client: MappingDatabaseClient,
    mapping: ChannelListingMappingAggregate,
  ): Promise<void> {
    const props = mapping.toProps();
    await client.channelListingMapping.upsert({
      where: { tenantId_id: { tenantId: props.tenantId, id: props.id } },
      create: {
        tenantId: props.tenantId,
        id: props.id,
        connectionId: props.connectionId,
        externalListingId: props.externalListingId,
        externalUnitId: props.externalUnitId,
        propertyId: props.propertyId,
        unitId: props.unitId,
        syncDirection: props.syncDirection as PrismaChannelSyncDirection,
        status: props.status as PrismaChannelListingMappingStatus,
        mappingVersion: props.mappingVersion,
        lastError: props.lastError,
        createdAt: props.createdAt,
        updatedAt: props.updatedAt,
      },
      update: {
        connectionId: props.connectionId,
        externalListingId: props.externalListingId,
        externalUnitId: props.externalUnitId,
        propertyId: props.propertyId,
        unitId: props.unitId,
        syncDirection: props.syncDirection as PrismaChannelSyncDirection,
        status: props.status as PrismaChannelListingMappingStatus,
        mappingVersion: props.mappingVersion,
        lastError: props.lastError,
        createdAt: props.createdAt,
        updatedAt: props.updatedAt,
      },
    });
  }
}
