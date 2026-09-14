import type { BackgroundJobEntry, BackgroundJobStatus } from "../../../shared/types/index";

export interface ChannelPollJobSnapshot extends BackgroundJobEntry {
  readonly nextRetryAt: Date | null;
  readonly completedAt: Date | null;
  readonly startedAt: Date | null;
  readonly lastError: string | null;
}

/**
 * P1-S7b — query poll_channel_connection jobs for a connection (in-flight / latest).
 */
export interface IChannelPollJobQuery {
  findInFlightPoll(params: {
    tenantId: string;
    connectionId: string;
  }): Promise<ChannelPollJobSnapshot | null>;

  /**
   * Latest poll job for the connection (any status), newest createdAt first.
   */
  findLatestPoll(params: {
    tenantId: string;
    connectionId: string;
  }): Promise<ChannelPollJobSnapshot | null>;

  listPollJobs(params: {
    tenantId: string;
    connectionId: string;
    limit?: number;
  }): Promise<readonly ChannelPollJobSnapshot[]>;
}

export const CHANNEL_POLL_IN_FLIGHT_STATUSES: ReadonlySet<BackgroundJobStatus> = new Set([
  "pending",
  "processing",
]);
