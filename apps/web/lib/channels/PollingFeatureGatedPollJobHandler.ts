import type {
  BackgroundJobEntry,
  IBackgroundJobHandler,
} from "@hcp/domain";
import { createLogger } from "@/lib/logging/logger";
import { isChannelsPollingEnabled } from "./polling-enabled";

const logger = createLogger({ action: "channels.poll_job" });

/**
 * CM-4b S4a-2a — wraps PollChannelConnectionJobHandler with CHANNELS_POLLING_ENABLED.
 * When disabled: complete successfully without invoking the inner handler
 * (no provider lookup, credential resolve, cursor load/advance, or inbox writes).
 */
export class PollingFeatureGatedPollJobHandler implements IBackgroundJobHandler {
  constructor(
    private readonly inner: IBackgroundJobHandler,
    private readonly isEnabled: () => boolean = isChannelsPollingEnabled,
  ) {}

  canHandle(jobType: string): boolean {
    return this.inner.canHandle(jobType);
  }

  async run(job: BackgroundJobEntry): Promise<void> {
    if (!this.isEnabled()) {
      const connectionId =
        typeof job.payload.connectionId === "string"
          ? job.payload.connectionId
          : undefined;
      logger.info(
        "poll_channel_connection skipped: CHANNELS_POLLING_ENABLED is not true",
        {
          jobId: job.id,
          jobType: job.jobType,
          tenantId: job.tenantId ?? null,
          connectionId: connectionId ?? null,
        },
      );
      return;
    }

    await this.inner.run(job);
  }
}
