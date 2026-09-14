import type {
  BackgroundJobEntry,
  BackgroundJobStatus,
} from "../../shared/types/index";
import type {
  ChannelPollJobSnapshot,
  IChannelPollJobQuery,
} from "../ports/IChannelPollJobQuery";
import { CHANNEL_POLL_IN_FLIGHT_STATUSES } from "../ports/IChannelPollJobQuery";
import { POLL_CHANNEL_CONNECTION_JOB_TYPE } from "../../platform/async/jobs/types/JobTypes";

function connectionMatches(
  job: BackgroundJobEntry,
  tenantId: string,
  connectionId: string,
): boolean {
  if (job.jobType !== POLL_CHANNEL_CONNECTION_JOB_TYPE) return false;
  if (job.tenantId !== tenantId) return false;
  const payload = job.payload as { connectionId?: unknown };
  if (payload.connectionId === connectionId) return true;
  if (
    typeof job.idempotencyKey === "string" &&
    job.idempotencyKey.startsWith(`poll_channel_connection:${tenantId}:${connectionId}`)
  ) {
    return true;
  }
  return false;
}

function toSnapshot(
  job: BackgroundJobEntry,
  extras?: Partial<
    Pick<ChannelPollJobSnapshot, "nextRetryAt" | "completedAt" | "startedAt" | "lastError">
  >,
): ChannelPollJobSnapshot {
  return {
    ...job,
    nextRetryAt: extras?.nextRetryAt ?? null,
    completedAt: extras?.completedAt ?? null,
    startedAt: extras?.startedAt ?? null,
    lastError: extras?.lastError ?? null,
  };
}

/**
 * In-memory poll job query backed by an injectable job list (tests / domain fakes).
 */
export class InMemoryChannelPollJobQuery implements IChannelPollJobQuery {
  private readonly completedAtById = new Map<string, Date>();

  constructor(private readonly listAll: () => readonly BackgroundJobEntry[]) {}

  /** Test helper: attach completedAt for interval-based scheduler checks. */
  setCompletedAt(jobId: string, completedAt: Date): void {
    this.completedAtById.set(jobId, completedAt);
  }

  async findInFlightPoll(params: {
    tenantId: string;
    connectionId: string;
  }): Promise<ChannelPollJobSnapshot | null> {
    const matches = this.listAll()
      .filter((job) => connectionMatches(job, params.tenantId, params.connectionId))
      .filter((job) => CHANNEL_POLL_IN_FLIGHT_STATUSES.has(job.status as BackgroundJobStatus))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return matches[0]
      ? toSnapshot(matches[0], {
          completedAt: this.completedAtById.get(matches[0].id) ?? null,
        })
      : null;
  }

  async findLatestPoll(params: {
    tenantId: string;
    connectionId: string;
  }): Promise<ChannelPollJobSnapshot | null> {
    const matches = this.listAll()
      .filter((job) => connectionMatches(job, params.tenantId, params.connectionId))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return matches[0]
      ? toSnapshot(matches[0], {
          completedAt: this.completedAtById.get(matches[0].id) ?? null,
        })
      : null;
  }

  async listPollJobs(params: {
    tenantId: string;
    connectionId: string;
    limit?: number;
  }): Promise<readonly ChannelPollJobSnapshot[]> {
    const limit = params.limit ?? 20;
    return this.listAll()
      .filter((job) => connectionMatches(job, params.tenantId, params.connectionId))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit)
      .map((job) =>
        toSnapshot(job, {
          completedAt: this.completedAtById.get(job.id) ?? null,
        }),
      );
  }
}
