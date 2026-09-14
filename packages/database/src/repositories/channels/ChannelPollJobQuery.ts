import type {
  ChannelPollJobSnapshot,
  IChannelPollJobQuery,
} from "@hcp/domain";
import { POLL_CHANNEL_CONNECTION_JOB_TYPE } from "@hcp/domain";
import { prisma } from "../../client";

function mapRow(record: {
  id: string;
  tenantId: string | null;
  jobType: string;
  payload: unknown;
  status: ChannelPollJobSnapshot["status"];
  priority: number;
  runAt: Date;
  idempotencyKey: string | null;
  attemptCount: number;
  maxAttempts: number;
  createdAt: Date;
  nextRetryAt: Date | null;
  completedAt: Date | null;
  startedAt: Date | null;
  lastError: string | null;
}): ChannelPollJobSnapshot {
  return {
    id: record.id,
    tenantId: record.tenantId,
    jobType: record.jobType,
    payload: record.payload as Record<string, unknown>,
    status: record.status,
    priority: record.priority,
    runAt: record.runAt,
    idempotencyKey: record.idempotencyKey,
    attemptCount: record.attemptCount,
    maxAttempts: record.maxAttempts,
    createdAt: record.createdAt,
    nextRetryAt: record.nextRetryAt,
    completedAt: record.completedAt,
    startedAt: record.startedAt,
    lastError: record.lastError,
  };
}

function matchesConnection(
  row: { payload: unknown; idempotencyKey: string | null },
  tenantId: string,
  connectionId: string,
): boolean {
  const payload = row.payload as Record<string, unknown>;
  if (payload.connectionId === connectionId) return true;
  const key = row.idempotencyKey;
  return (
    typeof key === "string" &&
    key.startsWith(`poll_channel_connection:${tenantId}:${connectionId}`)
  );
}

export class PrismaChannelPollJobQuery implements IChannelPollJobQuery {
  async findInFlightPoll(params: {
    tenantId: string;
    connectionId: string;
  }): Promise<ChannelPollJobSnapshot | null> {
    const rows = await prisma.backgroundJob.findMany({
      where: {
        jobType: POLL_CHANNEL_CONNECTION_JOB_TYPE,
        tenantId: params.tenantId,
        status: { in: ["pending", "processing"] },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 50,
    });
    const match = rows.find((row) =>
      matchesConnection(row, params.tenantId, params.connectionId),
    );
    return match ? mapRow(match) : null;
  }

  async findLatestPoll(params: {
    tenantId: string;
    connectionId: string;
  }): Promise<ChannelPollJobSnapshot | null> {
    const rows = await this.listPollJobs({ ...params, limit: 20 });
    return rows[0] ?? null;
  }

  async listPollJobs(params: {
    tenantId: string;
    connectionId: string;
    limit?: number;
  }): Promise<readonly ChannelPollJobSnapshot[]> {
    const limit = params.limit ?? 20;
    const rows = await prisma.backgroundJob.findMany({
      where: {
        jobType: POLL_CHANNEL_CONNECTION_JOB_TYPE,
        tenantId: params.tenantId,
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 100,
    });
    return rows
      .filter((row) => matchesConnection(row, params.tenantId, params.connectionId))
      .slice(0, limit)
      .map(mapRow);
  }
}
