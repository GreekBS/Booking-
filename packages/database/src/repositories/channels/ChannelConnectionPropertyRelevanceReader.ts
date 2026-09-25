import {
  ChannelConnection as ChannelConnectionAggregate,
  parseFeedSemanticMode,
  parseSemanticConfigVersion,
  resolveConnectionRelevantPropertyIds,
  type ChannelConnection,
  type ChannelConnectionStatus,
  type ChannelSource,
  type IChannelConnectionPropertyRelevanceReader,
} from "@hcp/domain";
import type { PrismaClient } from "@prisma/client";
import type {
  ChannelConnection as PrismaChannelConnection,
} from "@prisma/client";
import {
  prisma,
  withTenantTransaction,
  type PrismaTransactionClient,
} from "../../client";

type ConnectionDatabaseClient = PrismaClient | PrismaTransactionClient;

function toDomain(record: PrismaChannelConnection): ChannelConnection {
  return ChannelConnectionAggregate.reconstitute({
    id: record.id,
    tenantId: record.tenantId,
    provider: record.provider as ChannelSource,
    displayName: record.displayName,
    status: record.status as ChannelConnectionStatus,
    credentialRef: record.credentialRef,
    webhookVerificationRef: record.webhookVerificationRef,
    lastError: record.lastError,
    semanticMode: parseFeedSemanticMode(record.semanticMode),
    semanticConfigVersion: parseSemanticConfigVersion(record.semanticConfigVersion),
    inventoryApplyEnabled: record.inventoryApplyEnabled === true,
    workspacePropertyId: record.workspacePropertyId ?? null,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  });
}

/**
 * Batched property relevance for ChannelConnection (Active Property 1.2).
 * Bounded queries — no per-connection N+1 for the common mapped path.
 */
export class PrismaChannelConnectionPropertyRelevanceReader
  implements IChannelConnectionPropertyRelevanceReader
{
  constructor(private readonly client: ConnectionDatabaseClient = prisma) {}

  async listRelevantToProperty(
    tenantId: string,
    propertyId: string,
  ): Promise<ChannelConnection[]> {
    return this.withTransaction(tenantId, async (tx) => {
      const [listingRows, productRows, workspaceCandidates] = await Promise.all([
        tx.channelListingMapping.findMany({
          where: {
            tenantId,
            propertyId,
            NOT: { status: "archived" },
          },
          select: { connectionId: true },
          distinct: ["connectionId"],
        }),
        tx.channelProductMapping.findMany({
          where: {
            tenantId,
            propertyId,
            NOT: { status: "archived" },
          },
          select: { connectionId: true },
          distinct: ["connectionId"],
        }),
        tx.channelConnection.findMany({
          where: {
            tenantId,
            workspacePropertyId: propertyId,
          },
          select: { id: true },
        }),
      ]);

      const mappedIds = new Set<string>([
        ...listingRows.map((r) => r.connectionId),
        ...productRows.map((r) => r.connectionId),
      ]);

      const workspaceCandidateIds = workspaceCandidates
        .map((c) => c.id)
        .filter((id) => !mappedIds.has(id));

      let workspaceOnlyIds: string[] = [];
      if (workspaceCandidateIds.length > 0) {
        const [listingHits, productHits] = await Promise.all([
          tx.channelListingMapping.findMany({
            where: {
              tenantId,
              connectionId: { in: workspaceCandidateIds },
              NOT: { status: "archived" },
            },
            select: { connectionId: true },
            distinct: ["connectionId"],
          }),
          tx.channelProductMapping.findMany({
            where: {
              tenantId,
              connectionId: { in: workspaceCandidateIds },
              propertyId: { not: null },
              NOT: { status: "archived" },
            },
            select: { connectionId: true },
            distinct: ["connectionId"],
          }),
        ]);
        const hasBearing = new Set([
          ...listingHits.map((r) => r.connectionId),
          ...productHits.map((r) => r.connectionId),
        ]);
        workspaceOnlyIds = workspaceCandidateIds.filter((id) => !hasBearing.has(id));
      }

      const connectionIds = [...new Set([...mappedIds, ...workspaceOnlyIds])];
      if (connectionIds.length === 0) {
        return [];
      }

      const connections = await tx.channelConnection.findMany({
        where: { tenantId, id: { in: connectionIds } },
        orderBy: { updatedAt: "desc" },
      });
      return connections.map(toDomain);
    });
  }

  async resolveRelevantPropertyIds(
    tenantId: string,
    connectionId: string,
  ): Promise<string[]> {
    return this.withTransaction(tenantId, async (tx) => {
      const connection = await tx.channelConnection.findUnique({
        where: { tenantId_id: { tenantId, id: connectionId } },
        select: { workspacePropertyId: true },
      });
      if (!connection) {
        return [];
      }

      const [listings, products] = await Promise.all([
        tx.channelListingMapping.findMany({
          where: { tenantId, connectionId },
          select: { propertyId: true, status: true },
        }),
        tx.channelProductMapping.findMany({
          where: { tenantId, connectionId },
          select: { propertyId: true, status: true },
        }),
      ]);

      return resolveConnectionRelevantPropertyIds({
        workspacePropertyId: connection.workspacePropertyId,
        listingMappings: listings,
        productMappings: products,
      });
    });
  }

  private async withTransaction<T>(
    tenantId: string,
    work: (tx: PrismaTransactionClient) => Promise<T>,
  ): Promise<T> {
    if (this.client !== prisma) {
      return work(this.client as PrismaTransactionClient);
    }
    return withTenantTransaction(tenantId, work);
  }
}
