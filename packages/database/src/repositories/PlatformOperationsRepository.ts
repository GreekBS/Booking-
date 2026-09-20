import type {
  BackgroundJobStatus,
  ChannelConnectionStatus,
  ChannelInboxProcessingStatus,
  IPlatformOperationsRepository,
  ListPlatformChannelsQuery,
  ListPlatformInboxQuery,
  ListPlatformJobsQuery,
  ListPlatformOutboxQuery,
  OutboxEventStatus,
  PlatformBackgroundJobRow,
  PlatformChannelConnectionDetail,
  PlatformChannelConnectionRow,
  PlatformChannelInboxRow,
  PlatformChannelMappingRow,
  PlatformInboxOutcome,
  PlatformOperationsAttention,
  PlatformOperationsHealth,
  PlatformOutboxRow,
  PlatformPage,
  PlatformStatusCount,
} from "@hcp/domain";
import { prisma } from "../client";
import type { Prisma } from "@prisma/client";

function truncateError(value: string | null | undefined, max = 280): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max)}…`;
}

function mapStatusCounts(
  rows: Array<{ status: string; _count: { _all: number } }>,
): PlatformStatusCount[] {
  return rows.map((r) => ({ status: r.status, count: r._count._all }));
}

export class PrismaPlatformOperationsRepository
  implements IPlatformOperationsRepository
{
  async listConnections(
    query: ListPlatformChannelsQuery,
  ): Promise<PlatformPage<PlatformChannelConnectionRow>> {
    const page = Math.max(1, query.page);
    const limit = Math.min(100, Math.max(1, query.limit));
    const skip = (page - 1) * limit;

    const where: Prisma.ChannelConnectionWhereInput = {};
    if (query.tenantId) where.tenantId = query.tenantId;
    if (query.provider) where.provider = query.provider;
    if (query.status) where.status = query.status;
    if (query.q) {
      where.OR = [
        { displayName: { contains: query.q, mode: "insensitive" } },
        { id: { contains: query.q, mode: "insensitive" } },
        { provider: { contains: query.q, mode: "insensitive" } },
      ];
    }

    const [rows, total] = await Promise.all([
      prisma.channelConnection.findMany({
        where,
        skip,
        take: limit,
        orderBy: { updatedAt: "desc" },
      }),
      prisma.channelConnection.count({ where }),
    ]);

    const tenantIds = [...new Set(rows.map((r) => r.tenantId))];
    const connectionKeys = rows.map((r) => ({
      tenantId: r.tenantId,
      connectionId: r.id,
    }));

    const [tenants, mappings] = await Promise.all([
      tenantIds.length
        ? prisma.tenant.findMany({
            where: { id: { in: tenantIds } },
            select: { id: true, name: true },
          })
        : Promise.resolve([]),
      connectionKeys.length
        ? prisma.channelListingMapping.findMany({
            where: {
              OR: connectionKeys.map((k) => ({
                tenantId: k.tenantId,
                connectionId: k.connectionId,
              })),
            },
            select: {
              tenantId: true,
              connectionId: true,
              propertyId: true,
            },
          })
        : Promise.resolve([]),
    ]);

    const tenantName = new Map(tenants.map((t) => [t.id, t.name]));
    const mappingMeta = new Map<string, { count: number; propertyIds: string[] }>();
    for (const m of mappings) {
      const key = `${m.tenantId}:${m.connectionId}`;
      const cur = mappingMeta.get(key) ?? { count: 0, propertyIds: [] };
      cur.count += 1;
      if (!cur.propertyIds.includes(m.propertyId)) {
        cur.propertyIds.push(m.propertyId);
      }
      mappingMeta.set(key, cur);
    }

    const data: PlatformChannelConnectionRow[] = rows.map((r) => {
      const meta = mappingMeta.get(`${r.tenantId}:${r.id}`) ?? {
        count: 0,
        propertyIds: [],
      };
      return {
        connectionId: r.id,
        tenantId: r.tenantId,
        tenantName: tenantName.get(r.tenantId) ?? r.tenantId,
        provider: r.provider,
        displayName: r.displayName,
        status: r.status as ChannelConnectionStatus,
        lastError: truncateError(r.lastError),
        hasCredentialRef: r.credentialRef != null,
        inventoryApplyEnabled: r.inventoryApplyEnabled,
        mappingCount: meta.count,
        propertyIds: meta.propertyIds,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      };
    });

    return { data, total, page, limit };
  }

  async getConnectionDetail(
    tenantId: string,
    connectionId: string,
  ): Promise<PlatformChannelConnectionDetail | null> {
    const record = await prisma.channelConnection.findUnique({
      where: { tenantId_id: { tenantId, id: connectionId } },
    });
    if (!record) return null;

    const [tenant, mappings, recentInbox, pollCursor] = await Promise.all([
      prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { name: true },
      }),
      prisma.channelListingMapping.findMany({
        where: { tenantId, connectionId },
        orderBy: { updatedAt: "desc" },
        take: 100,
      }),
      prisma.channelInboxItem.findMany({
        where: { tenantId, connectionId },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          tenantId: true,
          id: true,
          connectionId: true,
          provider: true,
          messageKind: true,
          ingressKind: true,
          status: true,
          outcome: true,
          attemptCount: true,
          lastError: true,
          outcomeDetail: true,
          receivedAt: true,
          createdAt: true,
          processedAt: true,
        },
      }),
      prisma.channelPollCursor.findUnique({
        where: { tenantId_connectionId: { tenantId, connectionId } },
        select: { updatedAt: true },
      }),
    ]);

    const mappingRows: PlatformChannelMappingRow[] = mappings.map((m) => ({
      mappingId: m.id,
      externalListingId: m.externalListingId,
      externalUnitId: m.externalUnitId,
      propertyId: m.propertyId,
      unitId: m.unitId,
      status: m.status,
      syncDirection: m.syncDirection,
      lastError: truncateError(m.lastError),
      updatedAt: m.updatedAt,
    }));

    const propertyIds = [
      ...new Set(mappingRows.map((m) => m.propertyId)),
    ];

    const connection: PlatformChannelConnectionRow = {
      connectionId: record.id,
      tenantId: record.tenantId,
      tenantName: tenant?.name ?? record.tenantId,
      provider: record.provider,
      displayName: record.displayName,
      status: record.status as ChannelConnectionStatus,
      lastError: truncateError(record.lastError),
      hasCredentialRef: record.credentialRef != null,
      inventoryApplyEnabled: record.inventoryApplyEnabled,
      mappingCount: mappingRows.length,
      propertyIds,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };

    return {
      connection,
      mappings: mappingRows,
      recentInbox: recentInbox.map(mapInboxRow),
      pollCursorUpdatedAt: pollCursor?.updatedAt ?? null,
    };
  }

  async listJobs(
    query: ListPlatformJobsQuery,
  ): Promise<PlatformPage<PlatformBackgroundJobRow>> {
    const page = Math.max(1, query.page);
    const limit = Math.min(100, Math.max(1, query.limit));
    const skip = (page - 1) * limit;

    const where: Prisma.BackgroundJobWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.jobType) where.jobType = query.jobType;
    if (query.tenantId) where.tenantId = query.tenantId;

    const [rows, total] = await Promise.all([
      prisma.backgroundJob.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ createdAt: "desc" }],
        select: {
          id: true,
          tenantId: true,
          jobType: true,
          status: true,
          priority: true,
          attemptCount: true,
          maxAttempts: true,
          runAt: true,
          lastError: true,
          createdAt: true,
          claimedAt: true,
          completedAt: true,
        },
      }),
      prisma.backgroundJob.count({ where }),
    ]);

    return {
      data: rows.map((r) => ({
        id: r.id,
        tenantId: r.tenantId,
        jobType: r.jobType,
        status: r.status as BackgroundJobStatus,
        priority: r.priority,
        attemptCount: r.attemptCount,
        maxAttempts: r.maxAttempts,
        runAt: r.runAt,
        lastError: truncateError(r.lastError),
        createdAt: r.createdAt,
        claimedAt: r.claimedAt,
        completedAt: r.completedAt,
      })),
      total,
      page,
      limit,
    };
  }

  async listInbox(
    query: ListPlatformInboxQuery,
  ): Promise<PlatformPage<PlatformChannelInboxRow>> {
    const page = Math.max(1, query.page);
    const limit = Math.min(100, Math.max(1, query.limit));
    const skip = (page - 1) * limit;

    const where: Prisma.ChannelInboxItemWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.provider) where.provider = query.provider;
    if (query.tenantId) where.tenantId = query.tenantId;
    if (query.connectionId) where.connectionId = query.connectionId;

    const [rows, total] = await Promise.all([
      prisma.channelInboxItem.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        select: {
          tenantId: true,
          id: true,
          connectionId: true,
          provider: true,
          messageKind: true,
          ingressKind: true,
          status: true,
          outcome: true,
          attemptCount: true,
          lastError: true,
          outcomeDetail: true,
          receivedAt: true,
          createdAt: true,
          processedAt: true,
        },
      }),
      prisma.channelInboxItem.count({ where }),
    ]);

    return {
      data: rows.map(mapInboxRow),
      total,
      page,
      limit,
    };
  }

  async listOutbox(
    query: ListPlatformOutboxQuery,
  ): Promise<PlatformPage<PlatformOutboxRow>> {
    const page = Math.max(1, query.page);
    const limit = Math.min(100, Math.max(1, query.limit));
    const skip = (page - 1) * limit;

    const where: Prisma.OutboxEventWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.eventType) {
      where.eventType = { contains: query.eventType, mode: "insensitive" };
    }
    if (query.tenantId) where.tenantId = query.tenantId;

    const [rows, total] = await Promise.all([
      prisma.outboxEvent.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          tenantId: true,
          eventType: true,
          aggregateType: true,
          aggregateId: true,
          status: true,
          attemptCount: true,
          lastError: true,
          createdAt: true,
          claimedAt: true,
          processedAt: true,
        },
      }),
      prisma.outboxEvent.count({ where }),
    ]);

    return {
      data: rows.map((r) => ({
        id: r.id,
        tenantId: r.tenantId,
        eventType: r.eventType,
        aggregateType: r.aggregateType,
        aggregateId: r.aggregateId,
        status: r.status as OutboxEventStatus,
        attemptCount: r.attemptCount,
        lastError: truncateError(r.lastError),
        createdAt: r.createdAt,
        claimedAt: r.claimedAt,
        processedAt: r.processedAt,
      })),
      total,
      page,
      limit,
    };
  }

  async getHealthSummary(): Promise<PlatformOperationsHealth> {
    const [connections, jobs, inbox, outbox] = await Promise.all([
      prisma.channelConnection.groupBy({
        by: ["status"],
        _count: { _all: true },
      }),
      prisma.backgroundJob.groupBy({
        by: ["status"],
        _count: { _all: true },
      }),
      prisma.channelInboxItem.groupBy({
        by: ["status"],
        _count: { _all: true },
      }),
      prisma.outboxEvent.groupBy({
        by: ["status"],
        _count: { _all: true },
      }),
    ]);

    return {
      connections: mapStatusCounts(connections),
      jobs: mapStatusCounts(jobs),
      inbox: mapStatusCounts(inbox),
      outbox: mapStatusCounts(outbox),
    };
  }

  async getAttentionSignals(): Promise<PlatformOperationsAttention> {
    const [
      connectionsError,
      jobsDeadLetter,
      jobsFailedPending,
      inboxFailed,
      inboxDeadLetter,
      outboxDeadLetter,
    ] = await Promise.all([
      prisma.channelConnection.count({ where: { status: "error" } }),
      prisma.backgroundJob.count({ where: { status: "dead_letter" } }),
      // Jobs that exhausted retries land in dead_letter; pending with lastError
      // still awaiting retry is a useful attention signal.
      prisma.backgroundJob.count({
        where: { status: "pending", lastError: { not: null } },
      }),
      prisma.channelInboxItem.count({ where: { status: "failed" } }),
      prisma.channelInboxItem.count({ where: { status: "dead_letter" } }),
      prisma.outboxEvent.count({ where: { status: "dead_letter" } }),
    ]);

    return {
      connectionsError,
      jobsDeadLetter,
      jobsFailedPending,
      inboxFailed,
      inboxDeadLetter,
      outboxDeadLetter,
    };
  }
}

function mapInboxRow(r: {
  tenantId: string;
  id: string;
  connectionId: string;
  provider: string;
  messageKind: string;
  ingressKind: string;
  status: string;
  outcome: string | null;
  attemptCount: number;
  lastError: string | null;
  outcomeDetail: string | null;
  receivedAt: Date;
  createdAt: Date;
  processedAt: Date | null;
}): PlatformChannelInboxRow {
  return {
    tenantId: r.tenantId,
    inboxItemId: r.id,
    connectionId: r.connectionId,
    provider: r.provider,
    messageKind: r.messageKind,
    ingressKind: r.ingressKind,
    status: r.status as ChannelInboxProcessingStatus,
    outcome: (r.outcome as PlatformInboxOutcome | null) ?? null,
    attemptCount: r.attemptCount,
    lastError: truncateError(r.lastError),
    outcomeDetail: truncateError(r.outcomeDetail, 200),
    receivedAt: r.receivedAt,
    createdAt: r.createdAt,
    processedAt: r.processedAt,
  };
}
